import { StitchAdminClientFactory } from '../src/admin';
import { StitchClientFactory } from '../src/client';
import BSON from 'bson';

const constants = require('./constants');

export const extractTestFixtureDataPoints = test => {
  const {
    userData: {
      apiKey: { key: apiKey },
      group: { groupId }
    },
    options: { baseUrl: serverUrl }
  } = test;
  return { apiKey, groupId, serverUrl };
};

export const buildAdminTestHarness = async(seedTestApp, apiKey, groupId, serverUrl) => {
  const harness = await TestHarness.initialize(apiKey, groupId, serverUrl);
  await harness.authenticate();
  if (seedTestApp) {
    await harness.createApp();
  }
  return harness;
};

export const buildClientTestHarness = async(apiKey, groupId, serverUrl) => {
  const harness = await buildAdminTestHarness(true, apiKey, groupId, serverUrl);
  await harness.setupStitchClient();
  return harness;
};

export const randomString = (length = 5) => {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = length; i > 0; i -= 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
};

export const createSampleMongodbService = async services => {
  const mongodbService = await services.create({
    type: 'mongodb',
    name: 'mdb',
    config: {
      uri: 'mongodb://localhost:26000'
    }
  });
  return mongodbService;
};

export const createSampleMongodbSyncService = async(services, partitionKey = 'key') => {
  const syncService = await services.create({
    type: 'mongodb',
    name: 'mdb',
    config: {
      uri: 'mongodb://localhost:26000',
      sync: {
        state: 'enabled',
        database_name: 'db',
        partition: {
          key: partitionKey,
          permissions: { read: true, write: true }
        }
      }
    }
  });
  return syncService;
};

export const addRuleToMongodbService = async(services, mongodbService, { database, collection, config }) => {
  const mongoSvcObj = services.service(mongodbService._id);
  await mongoSvcObj.rules().create(Object.assign({}, config, { database, collection }));
};

class TestHarness {
  static async initialize(apiKey, groupId, serverUrl = constants.DEFAULT_SERVER_URL) {
    const testHarness = new TestHarness(apiKey, groupId, serverUrl);
    testHarness.adminClient = await testHarness.adminPromise;
    return testHarness;
  }

  constructor(apiKey, groupId, serverUrl = constants.DEFAULT_SERVER_URL) {
    this.apiKey = apiKey;
    this.groupId = groupId;
    this.serverUrl = serverUrl;
    this.adminPromise = StitchAdminClientFactory.create(this.serverUrl);
  }

  async authenticate() {
    await this.adminClient.authenticate('apiKey', this.apiKey);
  }

  async configureUserpass(
    userpassConfig = {
      emailConfirmationUrl: 'http://emailConfirmURL.com',
      resetPasswordUrl: 'http://resetPasswordURL.com',
      confirmEmailSubject: 'email subject',
      resetPasswordSubject: 'password subject'
    }
  ) {
    return await this.app()
      .authProviders()
      .create({
        type: 'local-userpass',
        config: userpassConfig
      });
  }

  configureAnon() {
    return this.app()
      .authProviders()
      .create({
        type: 'anon-user'
      });
  }

  async createApp(testAppName, options) {
    if (!testAppName) {
      testAppName = `test-${new BSON.ObjectId().toString()}`;
    }
    this.testApp = await this.apps().create({ name: testAppName }, options);
    return this.testApp;
  }

  async createUser(email = 'test_user@domain.com', password = 'password') {
    this.userCredentials = { username: email, password };
    this.user = await this.app()
      .users()
      .create({ email, password });
    return this.user;
  }

  async setupStitchClient(shouldConfigureUserAuth = true) {
    if (shouldConfigureUserAuth) {
      await this.configureUserpass();
    }
    await this.createUser();

    this.stitchClient = await StitchClientFactory.create(this.testApp.client_app_id, { baseUrl: this.serverUrl });
    await this.stitchClient.authenticate('userpass', this.userCredentials);
  }

  async cleanup() {
    if (this.testApp) {
      await this.appRemove();
    }
  }

  apps() {
    return this.adminClient.apps(this.groupId);
  }

  app() {
    return this.apps().app(this.testApp._id);
  }

  privateAdminTriggers() {
    return this.adminClient.privateAdminTriggers(this.groupId, this.testApp._id);
  }

  async appRemove() {
    await this.app().remove();
    this.testApp = undefined;
  }
}
