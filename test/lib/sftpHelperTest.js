var assert = require('assert'),
    sftpHelper,
    sinon = require('sinon'),
    ssh2 = require('ssh2'),
    testHelper = require('../helpers');

const sftpConfig = {
  "host": "demo.wftpserver.com",
  "port": 2222,
  "password": "demo-user",
  "username": "demo-user"
};

describe('sftpHelper', function() {
  describe('#processFile()', function() {
    before(function() {
      var client = new ssh2.Client();
      sinon.stub(client, 'sftp').yields(null, testHelper.sftp);
      sinon.stub(client, 'connect', function(config) { client.emit('ready'); });
      sinon.stub(ssh2, 'Client').returns(client);
      sftpHelper = testHelper.require('../lib/sftpHelper');
    });

    after(function() {
      ssh2.Client.restore();
    });

    afterEach(function() {
      testHelper.sftp.clear();
    });

    it('should process a file and move to .done', function() {
      return testHelper.assertSuccess(
        sftpHelper.withSftpClient(sftpConfig, function(sftp) {
          return sftpHelper.writeFile(sftp, 'upload/test.txt', 'Hello World!')
          .then(function() {
            assert.equal(testHelper.sftp.objects['upload/.done/test.txt'], undefined);
            assert.equal(testHelper.sftp.objects['upload/test.txt'], 'Hello World!');
            return sftpHelper.processFile(sftp, 'upload', 'test.txt', function(body) {
              assert.equal(body, 'Hello World!');
            });
          });
        }),
        function(result) {
          assert.equal(testHelper.sftp.objects['upload/.done/test.txt'], 'Hello World!');
          assert.equal(testHelper.sftp.objects['upload/test.txt'], undefined);
        }
      );
    });

    it('should accept a file object in addition to a filename', function() {
      return testHelper.assertSuccess(
        sftpHelper.withSftpClient(sftpConfig, function(sftp) {
          return sftpHelper.writeFile(sftp, 'upload/test.txt', 'Hello World!')
          .then(function() {
            assert.equal(testHelper.sftp.objects['upload/.done/test.txt'], undefined);
            assert.equal(testHelper.sftp.objects['upload/test.txt'], 'Hello World!');
            return sftpHelper.processFile(sftp, 'upload', {filename: 'test.txt', attrs: { size: 12 }}, function(body) {
              assert.equal(body, 'Hello World!');
            });
          });
        }),
        function(result) {
          assert.equal(testHelper.sftp.objects['upload/.done/test.txt'], 'Hello World!');
          assert.equal(testHelper.sftp.objects['upload/test.txt'], undefined);
        }
      );
    });

    it('should not fail if the .done directory already exists', function() {
      return testHelper.assertSuccess(
        sftpHelper.withSftpClient(sftpConfig, function(sftp) {
          return sftpHelper.writeFile(sftp, 'upload/test.txt', 'Hello World!')
          .then(function() {
            assert.equal(testHelper.sftp.objects['upload/.done'], undefined);
            return sftp.mkdirAsync('upload/.done');
          })
          .then(function() {
            assert.equal(testHelper.sftp.objects['upload/.done'], null);
            assert.equal(testHelper.sftp.objects['upload/.done/test.txt'], undefined);
            assert.equal(testHelper.sftp.objects['upload/test.txt'], 'Hello World!');
            return sftpHelper.processFile(sftp, 'upload', {filename: 'test.txt', attrs: { size: 12 }}, function(body) {
              assert.equal(body, 'Hello World!');
            });
          });
        }),
        function(result) {
          assert.equal(testHelper.sftp.objects['upload/.done/test.txt'], 'Hello World!');
          assert.equal(testHelper.sftp.objects['upload/test.txt'], undefined);
        }
      );
    });
  });

  describe('#withSftpClient()', function() {
    before(function() {
      sftpHelper = testHelper.require('../lib/sftpHelper');
    });

    after(function() {
      delete require.cache[require.resolve('../../lib/sftpHelper')];
    });

    // TODO: Add a test that ensures the connection gets closed.
    // TODO: Consider moving this to the mock.

    it('should connect using username/password', function() {
      this.timeout(5000);
      return testHelper.assertSuccess(
        sftpHelper.withSftpClient({
          "host": "test.rebex.net",
          "port": 22,
          "password": "password",
          "username": "demo"
        }, function(sftp) {
          return sftp.readdirAsync('/')
          .then(function(list) {
            return list.map(function(item) { return item.filename; });
          });
        }),
        function(result) {
          assert.equal(result.length > 0, true);
        }
      );
    });

    it('should connect using a non-standard port', function() {
      this.timeout(5000);
      return testHelper.assertSuccess(
        sftpHelper.withSftpClient({
          "host": "demo.wftpserver.com",
          "port": 2222,
          "password": "demo-user",
          "username": "demo-user"
        }, function(sftp) {
          return sftp.readdirAsync('/')
          .then(function(list) {
            return list.map(function(item) { return item.filename; });
          });
        }),
        function(result) {
          assert.equal(result.length > 0, true);
        }
      );
    });
  });

  describe('#writeFile()', function() {
    // TODO: Consider moving this to the mock.

    before(function() {
      sftpHelper = testHelper.require('../lib/sftpHelper');
    });

    after(function() {
      delete require.cache[require.resolve('../../lib/sftpHelper')];
    });

    it('should write a file', function() {
      this.timeout(5000);
      return testHelper.assertSuccess(
        sftpHelper.withSftpClient(sftpConfig, function(sftp) {
          return sftpHelper.writeFile(sftp, 'upload/test.txt', 'Hello World!');
        }),
        function(result) {}
      );
    });
  });
});