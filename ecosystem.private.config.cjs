'use strict';
const fs = require('node:fs');
const {prepare} = require('./release-launcher.cjs');
module.exports = prepare(fs.readFileSync('/home/cibodas/apps/sikepel/.env','utf8'), require('./ecosystem.release.json'));
