# redis-pool
Resource pool based on redis

# Simple use
```javascript
const Pool = require('@zctod/redis-pool');
const redisConfig = {
    port: 6379,
    host: '127.0.0.1',
    password: '',
    db: 0
};
const pool = new Pool();
```
# API
Set initialization name，it can be ignored.
```javascript
pool.setPoolHeadName('order_pool');
```
Set redis config, you can constructor to put.
```javascript
pool.setRedis(redisConfig);
```
Set necessary field and filter code.
```javascript
pool.setCode({
    field: ['id'],
    filter: ['createCode', 'modelCode']
});
```
Set pool data(must set all field)
```javascript
pool.setPool({
  id: 1,
  createCode: 5,
  modelCode: 20,
}, data, poolName);
```
Get pool data(not to use field)
```javascript
const data = pool.getPool({
  createCode: 5,
  modelCode: 20,
  page: 1,
  pageSize: 10,
  sort: 'DESC',
}, poolName);
console.log(data);
```
Get pool data one(must use all field)
```javascript
const data = pool.getPoolOne({
  id: 5,
}, poolName);
console.log(data);
```
Update pool data one(must use all field)
```javascript
pool.updatePoolOne({
  id: 5,
}, data, poolName);
```
Delete pool data one(must use all field)
```javascript
pool.delPoolOne({
  id: 5,
}, poolName);
```
Clear pool
```javascript
pool.clearPool(poolName);
```
