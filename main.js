var AWS = require('aws-sdk'),
    Promise = require('bluebird')
    conf = Promise.promisifyAll(require('aws-lambda-config')),
    s3 = Promise.promisifyAll(require('node-s3-encryption-client')),
    awsS3 = Promise.promisifyAll(new AWS.S3()),
    sftpHelper = require('./lib/sftpHelper');

exports.handle = function(event, context) {
  if (event.Records) {
    return exports.newS3Object(event, context);
  } else {
    return exports.pollSftp(event, context);
  }
}

exports.pollSftp = function(event, context) {
  return Promise.try(function() {
    if (!event.streamName) throw new Error("streamName required for config discovery")
    return conf.getConfigAsync(context)
    .then(function(config) {
      var streamConfig = config[event.streamName];
      if (!streamConfig) throw new Error("streamName [" + event.streamName + "] not found in config");
      return exports.getSftpConfig(streamConfig)
      .then(function(sftpConfig) {
        var s3Location = streamConfig.s3Location;
        if (!s3Location) throw new Error("streamName [" + event.streamName + "] has no s3Location");
        return sftpHelper.withSftpClient(sftpConfig, function(sftp) {
          return exports.syncSftpDir(sftp, streamConfig.dir || '/', s3Location);
        });
      });
    });
  })
  .then(function(result) {
    context.succeed(result);
  })
  .catch(function(err) {
    console.error(err.stack || err);
    context.fail(err);
    throw err;
  });
}

exports.newS3Object = function(event, context) {
  return Promise.try(function() {
    return conf.getConfigAsync(context)
    .then(function(config) {
      return Promise.map(
        event.Records,
        function(record) {
          var fullS3Path = record.s3.bucket.name + '/' + record.s3.object.key;
          var newObjectS3Path = exports.getFilePathArray(fullS3Path);
          return s3.getObjectAsync({
            Bucket: record.s3.bucket.name,
            Key: record.s3.object.key
          })
          .then(function(objectData) {
            if (!objectData.Metadata || objectData.Metadata["synched"] != "true") {
              var configKeys = Object.keys(config).filter(function(key) {
                var s3Location = config[key].s3Location;
                if (s3Location) {
                  var configS3Path = exports.getFilePathArray(s3Location);
                  return configS3Path.join('/') == newObjectS3Path.slice(0, configS3Path.length).join('/');
                }
              });
              if (configKeys.length == 0) console.warn("No configured SFTP destination for " + fullS3Path);
              return Promise.map(
                configKeys,
                function(configKey) {
                  var streamConfig = config[configKey];
                  var configS3Path = exports.getFilePathArray(streamConfig.s3Location);
                  var sftpDirPath = exports.getFilePathArray(streamConfig.dir);
                  return exports.getSftpConfig(streamConfig)
                  .then(function(sftpConfig) {
                    return sftpHelper.withSftpClient(sftpConfig, function(sftp) {
                      var sftpFileName = sftpDirPath.concat(newObjectS3Path.slice(configS3Path.length)).join('/');
                      console.info("Writing " + sftpFileName + "...");
                      return sftpHelper.writeFile(
                        sftp,
                        sftpFileName,
                        objectData.Body
                      )
                      .then(function() {
                        console.info("...done");
                      });
                    });
                  });
                }
              )
              .then(function() {
                var metadata = objectData.Metadata || {};
                metadata["synched"] = "true";
                return awsS3.copyObjectAsync({
                  Bucket: record.s3.bucket.name,
                  Key: record.s3.object.key,
                  CopySource: record.s3.bucket.name + "/" + record.s3.object.key,
                  Metadata: metadata,
                  MetadataDirective: 'REPLACE'
                });
              });
            }
          });
        }
      );
    });
  })
  .then(function(result) {
    context.succeed(result);
  })
  .catch(function(err) {
    console.error(err.stack || err);
    context.fail(err);
    throw err;
  });
}

exports.getFilePathArray = function(filePath) {
  return (filePath || '').split('/').filter(function(s) { return s ? true : false });
}

exports.getSftpConfig = function(config) {
  return Promise.try(function() {
    if (!config.sftpConfig) throw new Error("SFTP config not found");
    if (config.sftpConfig.s3PrivateKey) {
      var bucketDelimiterLocation = config.sftpConfig.s3PrivateKey.indexOf("/");
      return s3.getObjectAsync({
        Bucket: config.sftpConfig.s3PrivateKey.substr(0, bucketDelimiterLocation),
        Key: config.sftpConfig.s3PrivateKey.substr(bucketDelimiterLocation + 1)
      })
      .then(function(objectData) {
        config.sftpConfig["privateKey"] = objectData.Body.toString();
        delete config.sftpConfig.s3PrivateKey;
        return config.sftpConfig;
      });
    } else return config.sftpConfig;
  })
}

exports.syncSftpDir = function(sftp, sftpDir, s3Location, topDir) {
  topDir = topDir || sftpDir;
  return sftp.readdirAsync(sftpDir)
  .then(function(dirList) {
    return Promise.map(
      dirList,
      function(fileInfo) {
        return Promise.try(function() {
          if (fileInfo.filename == sftpHelper.DoneDir) {
            return null;
          } else if (fileInfo.longname[0] == 'd') {
            return exports.syncSftpDir(sftp, sftpDir + '/' + fileInfo.filename, s3Location, topDir);
          } else {
            return sftpHelper.processFile(sftp, sftpDir, fileInfo.filename, function(body) {
              var s3Path = exports.getFilePathArray(s3Location),
                  sftpPath = exports.getFilePathArray(sftpDir),
                  topDirPath = exports.getFilePathArray(topDir);
              var s3Bucket = s3Path.shift();
              for (var i = 0; i < topDirPath.length; i++) sftpPath.shift(); // Remove the origin path from the destination directory
              var destDir = s3Path.concat(sftpPath).join('/');
              if (destDir.length > 0) destDir += '/';
              console.info("Writing " + s3Bucket + "/" + destDir + fileInfo.filename + "...");
              return s3.putObjectAsync({
                Bucket: s3Bucket,
                Key: destDir + fileInfo.filename,
                Body: body,
                Metadata: {
                  "synched": "true"
                }
              })
              .then(function(data) {
                console.info("...done");
                return data;
              });
            });
          }
        });
      }
    );
  })
}