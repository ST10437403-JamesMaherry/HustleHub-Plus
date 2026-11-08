'use strict';

const mongoose = require('mongoose');
const User = require('./models/User');
const { hashPassword } = require('./utils/password');

// This script is supplied to Node through stdin inside the disposable API container.
async function seed() {
  if (process.env.COMPOSE_CI_FIXTURE !== 'true' ||
      process.env.MONGO_URI !== 'mongodb://mongo:27017/hustlehub_ci?replicaSet=rs0' ||
      !/^[a-f0-9]{64}$/.test(process.env.JWT_SECRET || '') ||
      process.env.CI_ADMIN_EMAIL !== 'ci.admin@hustlehub.test' ||
      !/^Ci-[a-f0-9]{48}!$/.test(process.env.CI_ADMIN_PASSWORD || '')) {
    throw new Error('Invalid disposable fixture configuration.');
  }
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (mongoose.connection.name !== 'hustlehub_ci' || hello.setName !== 'rs0') {
    throw new Error('Unexpected database identity.');
  }
  await User.init();
  await User.create({
    fullName: 'CI Administrator',
    email: process.env.CI_ADMIN_EMAIL,
    passwordHash: await hashPassword(process.env.CI_ADMIN_PASSWORD),
    role: 'admin',
    sessionVersion: 0
  });
  console.log('Disposable administrator created without consuming API rate limits.');
}

seed().catch(() => {
  console.error('Disposable administrator provisioning failed. No diagnostic secrets were printed.');
  process.exitCode = 1;
}).finally(async () => {
  await mongoose.disconnect();
});
