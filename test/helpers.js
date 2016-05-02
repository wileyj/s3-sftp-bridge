var assert = require('assert'),
    context = require('aws-lambda-mock-context');

exports.assertSuccess = function(promise, check) {
  return promise
  .then(function(results) {
    return check(results);
  })
  .catch(assert.ifError);
}

exports.assertContextSuccess = function(promise, context, check) {
  return promise
  .then(function() {
    return context.Promise
    .then(function(results) {
      return check(results);
    })
  })
  .catch(assert.ifError);
}

exports.assertFailure = function(promise, message) {
  return promise
  .then(function(results) {
    assert.ok(false, "Expected to throw an error, but was successful");
  })
  .catch(function(err) {
    if (err.name == "AssertionError")
      throw err;
    else
      assert((err.message || "").match(message), "Expected [" + err + "] to match [" + message + "] but it did not");
  });
}

exports.assertContextFailure = function(promise, context, message) {
  return promise
  .then(function() {
    return context.Promise
    .then(function(results) {
      assert.ok(false, "Expected to throw an error, but was successful");
    })
  })
  .catch(function(err) {
    if (err.name == "AssertionError")
      throw err;
    else
      assert(err.message.match(message), "Expected [" + err + "] to match [" + message + "] but it did not");
  });
}

exports.clearContext = function() {
  return context({
    region: "us-east-1",
    account: "1234567890",
    functionName: "test"
  });
}

exports.require = function(lib) {
  delete require.cache[require.resolve(lib)];
  return require(lib);
}

exports.s3 = {
  'objects': {},
  'metadata': {},
  'clear': function() {
    this.objects = {};
    this.metadata = {};
  },
  'copyObject': function(params, callback) {
    if (!params.CopySource) throw {"code": "MissingRequiredParameter", message: "Missing required key 'CopySource' in params"};
    var fullKey = params.Bucket + "/" + params.Key;
    if (params.Metadata) this.metadata[fullKey] = params.Metadata;
    callback(null, {"ETag": "s3-object-tag"});
  },
  'getObject': function(params, callback) {
    var fullKey = params.Bucket + "/" + params.Key;
    var object = this.objects[fullKey];
    if (params.Range) {
      var matches = params.Range.match(/bytes=(\d+)-(\d+)/);
      if (matches[1] && matches[2]) {
        object = object.substr(parseInt(matches[1]), parseInt(matches[2]));
      }
    }
    
    if (object) {
      callback(null, {Body: new Buffer(object), ContentLength: object.length, Metadata: this.metadata[fullKey] });
    } else {
      callback(new Error("Object [" + fullKey + "] not found"));
    }
  },
  'headObject': function(params, callback) {
    var fullKey = params.Bucket + "/" + params.Key;
    var object = this.objects[fullKey];
    
    if (object) {
      callback(null, { ContentLength: object.length, Metadata: this.metadata[fullKey] });
    } else {
      callback(new Error("Object [" + fullKey + "] not found"));
    }
  },
  'putObject': function(params, callback) {
    var fullKey = params.Bucket + "/" + params.Key;
    this.objects[fullKey] = params.Body;
    if (params.Metadata) this.metadata[fullKey] = params.Metadata;
    callback(null, {"ETag": "s3-object-tag"});
  }
}
exports.sftp = {
  'objects': {},
  'object_times': {},
  'clear': function() {
    this.objects = {};
    this.object_times = {};
  },
  'setTime': function(path, daysBeforeNow) {
    var date = new Date();
    date.setDate(date.getDate() - daysBeforeNow);
    this.object_times[path] = dateToMtime(date);
  },
  'close': function(handle, callback) {
    callback(null);
    return true;
  },
  'mkdir': function(path, callback) {
    if (!this.objects[path]) {
      this.objects[path] = null;
    }
    callback(null);
    return true;
  },
  'unlink': function(path, callback) {
    if (this.objects[path]) {
      delete this.objects[path];
    }
    callback(null);
    return true;
  },
  'open': function(filename, mode, callback) {
    var dir = filename.substr(0, filename.lastIndexOf('/'));
    if (this.objects[dir] != null) throw new Error("dir " + dir + " does not exist");
    callback(null, new Buffer(filename));
    return true;
  },
  'read': function(handle, buffer, offset, length, position, callback) {
    var path = handle.toString();
    var bytesWritten = 0;
    if (this.objects[path]) {
      bytesWritten = buffer.write(this.objects[path]);
    }
    callback(null, bytesWritten, buffer, buffer.length);
    return true;
  },
  'readdir': function(location, callback) {
    var matching = Object.keys(this.objects).filter(function(key) { return key.startsWith(location + '/') });
    var objects = this.objects;
    var object_times = this.object_times;
    var dirList = {};
    matching.forEach(function(key) {
      var object = objects[key],
          path = key.split('/'),
          locationPath = location.split('/');
      for (var i = 0; i < locationPath.length; i++) path.shift();
      var isDir = (object == null) || path.length > 1,
          filename = path[0],
          fileSize = isDir ? 4096 : object.length;
      dirList[filename] = {
        filename: filename,
        longname: (isDir ? 'd' : '-') + '-rw-r--r--   1 root root   ' + fileSize + ' Oct 07  2014 ' + filename,
        attrs: {
          size: fileSize,
          mtime: object_times[key] || dateToMtime(new Date())
        }
      }
    });
    callback(null, Object.keys(dirList).map(function(key) { return dirList[key]; }));
    return true;
  },
  'rename': function(srcPath, destPath, callback) {
    if (this.objects[srcPath]) {
      this.objects[destPath] = this.objects[srcPath];
      delete this.objects[srcPath];
    }
    callback(null);
    return true;
  },
  'write': function(handle, buffer, offset, length, position, callback) {
    this.objects[handle.toString()] = buffer.toString();
    this.object_times[handle.toString()] = dateToMtime(new Date());
    callback(null);
    return true;
  }
}

function dateToMtime(date) {
  return Math.round(date.valueOf() / 1000);
}

if (!String.prototype.startsWith) {
    String.prototype.startsWith = function(searchString, position){
      position = position || 0;
      return this.substr(position, searchString.length) === searchString;
  };
}