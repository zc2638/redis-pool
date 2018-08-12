'use strict';

const Pool = require('./index');
const pool = new Pool();
pool.setPool({
    createCode: 1,
}, {
    test: 1,
});
