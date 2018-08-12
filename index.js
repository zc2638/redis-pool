'use strict';

const Redis = require('ioredis');

class Pool {

    constructor(options)
    {
        this.redis = new Redis(options);
        this.code = {
            field: ['id'],
            filter: [],
        };
        this.poolHeadName = 'redis_pool';
    }

    setRedis(options)
    {
        if (!options) {
            options = {
                port: 6379,
                host: '127.0.0.1',
                password: '',
                db: 0
            };
        }
        this.redis = new Redis(options);
    }

    setCode(field = [], filter = [])
    {
        if (!Array.isArray(field) || !Array.isArray(filter)) {
            throw new Error('The parameter type must be array.');
        }
        this.code = { field, filter };
    }

    setPoolHeadName(name)
    {
        if (!name) {
            throw new Error('The parameter can not be empty.');
        }
        this.poolHeadName = name;
    }

    getPoolName(name)
    {
        let poolName = this.poolHeadName;
        if (name) {
            poolName += '_' + name;
        }
        return poolName;
    }

    getFieldKey(params, poolName)
    {
        const pre = this.getPoolName(poolName);
        const field = this.code.field;
        let fieldKey;
        let status = true;
        for (let k in field) {
            if (field.hasOwnProperty(k)) {
                parseInt(k) === 0 ? fieldKey = pre : null;
                if (!params[field[k]]) {
                    status = false;
                    break;
                }
                fieldKey += '-' + field[k] + '_' + params[field[k]];
            }
        }
        if (!status) {
            throw new Error('The field of data must be all exist');
        }
        return fieldKey;
    }

    getFilterKeys(params, poolName)
    {
        const pre = this.getPoolName(poolName);
        const filter = this.code.filter;
        let filterKey, filterKeys = [];
        filterKeys.push(pre);
        for (let v of filter) {
            if (params.hasOwnProperty(v)) {
                if (Array.isArray(params[v])) {
                    for (let vv of params[v]) {
                        filterKey = pre + '-' + v + '_' + vv;
                        filterKeys.push(filterKey);
                    }
                } else {
                    filterKey = pre + '-' + v + '_' + params[v];
                    filterKeys.push(filterKey);
                }
            }
        }
        return filterKeys;
    }

    async setPool(data, info, poolName)
    {
        if (typeof info !== 'object' || !info) {
            throw new Error('The parameter info type must be object.');
        }
        const pre = this.getPoolName(poolName);
        const {redis} = this;
        const fieldKey = this.getFieldKey(data, poolName);
        const filterKeys = this.getFilterKeys(data, poolName);
        let task = [];
        for (let v of filterKeys) {
            task.push(['rpush', v, fieldKey]);
        }
        await redis.multi(task).exec();
        info['_' + pre] = filterKeys;
        info = JSON.stringify(info);
        await redis.set(fieldKey, info);
        return true;
    }

    async getPool(params, poolName)
    {
        const {redis} = this;
        const pre = this.getPoolName(poolName);
        let page, pageSize;
        if (typeof params !== 'object' || !params) {
            params = {};
        }
        page = params.hasOwnProperty('page') ? parseInt(params.page) : 1;
        pageSize = params.hasOwnProperty('pageSize') ? parseInt(params.pageSize) : 10;
        delete params.page;
        delete params.pageSize;
        const keys = Object.keys(params);
        let filterKey, arr = [], dataArr = [], currentKeys = [];
        if (keys.length > 0) {
            for (let k of keys) {
                filterKey = pre + '-' + k + '_' + params[k];
                arr.push(await redis.lrange(filterKey, 0, -1));
            }
        } else {
            arr.push(await redis.lrange(pre, 0, -1));
        }
        for (let kk in arr) {
            if (parseInt(kk) === 0) {
                dataArr = arr[kk];
            } else {
                const length = dataArr.length;
                for (let i = 0;i < length;i++) {
                    if (arr[kk].indexOf(dataArr[i]) >= 0) {
                        currentKeys.push(dataArr[i]);
                    }
                }
                dataArr = currentKeys;
                currentKeys = [];
            }
        }
        let pipe = redis.pipeline();
        const num = dataArr.length;
        //默认以field的第一个标识进行降序排序
        let sortField = code.field[0];
        if (sortField) {
            dataArr = dataArr.sort(function (v1, v2) {
                v1 = parseInt(v1.split(sortField + '_')[1]);
                v2 = parseInt(v2.split(sortField + '_')[1]);
                return v2 - v1;
            });
        }
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        const data = dataArr.slice(start, end);
        const length_data = data.length;
        for (let i = 0;i < length_data;i++) {
            pipe.get(data[i]);
        }
        const res = await pipe.exec();
        let list = [];
        for (let v of res) {
            if (!v[0] && v[1]) {
                list.push(JSON.parse(v[1]));
            }
        }
        return {
            list: list,
            page: {
                total: num,
                perPage: pageSize,
                totalPages: Math.ceil(num / pageSize),
                currentPage: page,
                start: start + 1,
                end: end,
            },
        };
    }

    async getPoolOne(data, poolName)
    {
        if (typeof data !== 'object') {
            return false;
        }
        const {redis} = this;
        const fieldKey = this.getFieldKey(data, poolName);
        const info = await redis.get(fieldKey);
        return info ? JSON.parse(info) : null;
    }


    async delPool(data, poolName)
    {
        const {redis, code} = this;
        const pre = this.getPoolName(poolName);
        let task = [], status = true;
        const fieldKey = this.getFieldKey(data, poolName);
        let info = await redis.get(fieldKey);
        if (!info) {
            return false;
        }
        info = JSON.parse(info);
        const pool = info['_' + pre];
        if (Array.isArray(pool)) {
            for (let key of pool) {
                task.push(['lrem', key, 0, fieldKey]);
            }
        }
        await redis.multi(task).exec();
        await redis.del(fieldKey);
        return true;
    }

    async clearPool(poolName)
    {
        const {redis} = this;
        const pre = this.getPoolName(poolName);
        const data = await redis.keys(pre + '-*');
        await redis.del(pre);
        if (data.length > 0) {
            await redis.del(data);
        }
    }
}

module.exports = Pool;