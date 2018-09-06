'use strict';

const Pool = require('./index');
const pool = new Pool();
pool.setPoolHeadName('order_pool');
const info = {
    test: 1,
};
pool.setPool({ id: 1 }, info).then(res => {
    console.log(res);
});
