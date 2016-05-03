// Use this to manually test connections, outside of AWS Lambda.
// You will need to manually create ./manual_test/sftpConfig.js with content in this format:
// exports.sftpConfig = {
//   "host": "",
//   "password": "",
//   "port": 22,
//   "username": ""
// }

var AWS = require('aws-sdk'),
    ctx,
    main,
    Promise = require('bluebird'),
    sinon = require('sinon'),
    sftpConfig = require('./sftpConfig'),
    testHelper = require('../test/helpers');

describe('main', function() {
  var config = {
    "test-stream": {
      "sftpLocation": "dir",
      "sftpConfig": sftpConfig.sftpConfig,
      "s3Location": "my-bucket"
    }
  }

  before(function() {
    sinon.stub(AWS, 'S3').returns(testHelper.s3);
    main = testHelper.require('../main');
  });

  beforeEach(function() {
    ctx = testHelper.clearContext();
  });

  after(function() {
    AWS.S3.restore();
  });

  afterEach(function() {
    testHelper.s3.clear();
  });

  describe('#handle()', function() {
    it('should connect', function() {
      testHelper.s3.objects["aws.lambda.us-east-1.1234567890.config/test.json"] = JSON.stringify(config);
      return testHelper.assertContextSuccess(
        main.handle({resources: ["arn:aws:events:us-east-1:1234567890:rule/test-stream"]}, ctx),
        ctx,
        function(results) {
          console.log(testHelper.s3.objects);
        }
      );
    });
  });
});