# s3-sftp-bridge
An AWS Lambda function that syncs files between Amazon S3 and external FTP servers. For S3 => SFTP, it
will automatically sync when objects are uploaded to S3. For SFTP => S3, it will poll the SFTP server
at a given interval and copy to S3. It will maintain the origin directory structure when copying to the
destination.

After pulling files from the SFTP server, they will be moved to a '.done' subdirectory in the same directory.
This prevents us from copying the same files over and over again. It also allows easy re-sending (by copying
the file back into the original directory); the consequence is that files in the '.done' subdirectory will
be ignored.

## Configuration
Config should be stored in a .json file in S3 according to https://github.com/gilt/aws-lambda-config#motivation.
The configuration is a map of streamName to configuration for that stream:

```
{
  "stream1": {
    "s3Location": "your-bucket-name/destination/directory",
    "sftpConfig": {
      "host": "hostname",
      "port": 2222,
      "s3PrivateKey": "another-bucket-name/path/to/private_key",
      "username": "user"
    }
  },
  "stream2": {
    "s3Location": "your-other-bucket-name/destination/directory",
    "sftpConfig": {
      "host": "hostname",
      "username": "user",
      "password": "pwd"
    }
  }
}
```

### dir
The directory (can be nested) on the SFTP side to either a) look for new files to copy to S3 or b) drop into when
copying from S3.

### s3Location
The S3 location where the files should be copied. Can include a subdirectory after the bucket name. Valid formats:
bucket-name
bucket-name/sub-directory
bucket-name/sub/directory

### sftpConfig
A JSON object that contains any of the connection options listed here: https://www.npmjs.com/package/ssh2#client-methods.

This can also optionally include an "s3PrivateKey" property, which should be a S3 bucket/object-key path that
contains the SSH private key to use in the connection. If used, this should be encrypted and uploaded according
to https://github.com/gilt/node-s3-encryption-client.


## Outside configuration

### Networking
TODO: Explain here

### Triggering the sync
Two events are necessary to trigger this bridge to sync between the two systems, as detailed below.

#### S3 => SFTP
Any origin S3 buckets/locations should be set up to trigger the bridge Lambda function on the putObject event, with
all requisite permissions. The included CloudFormation template will set up a fresh S3 bucket given as a stack
property. But any additional S3 buckets + notifications will need to be setup manually.

#### SFTP => S3
The included Lambda function will need to poll the SFTP server using a scheduled event in AWS Lambda. The scheduled
event should include a single property, "streamName", set to the corresponding stream in config:

```
{
  "streamName": "foo"
}
```

The Lambda scheduled event system allows you to schedule the event at whatever interval is appropriate for your setup.
See http://docs.aws.amazon.com/lambda/latest/dg/with-scheduled-events.html for details.


## Deployment (contributors)
After making changes, please do the following:

1. Upload this zipped repo to the com.gilt.public.backoffice/lambda_functions bucket. To produce the .zip file:

   ```
     rm -rf node_modules
     npm install --production
     zip -r s3-sftp-bridge.zip . -x *.git* -x *s3-sftp-bridge.zip* -x cloud_formation/\* -x *aws-sdk*
   ```

   Unfortunately we can't use the Github .zip file directly, because it zips the code into a subdirectory named after
   the repo; AWS Lambda then can't find the .js file containing the helper functions because it is not on the top-level.

2. Upload the edited s3-sftp-bridge-deploy.template to com.gilt.public.backoffice/cloudformation_templates


## License
Copyright 2016 Gilt Groupe, Inc.

Licensed under the Apache License, Version 2.0: http://www.apache.org/licenses/LICENSE-2.0