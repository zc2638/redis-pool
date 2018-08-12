'use strict';

const BaseService = require('./baseService');

class PoolService extends BaseService {

    code()
    {
        return {
            filter: [
                'spCode',//起始省
                'scCode',//起始市
                'saCode',//起始区
                'epCode',//起始省
                'ecCode',//起始市
                'eaCode',//起始区
                'modelCode',//车辆型号
                'appointCode',//预约时间
            ],
            field: [
                'oid',//创建时间
            ],
        };
    }

    poolname(name)
    {
        let poolname = 'order_pool';
        if (name) {
            poolname += '_' + name;
        }
        return poolname;
    }

    //添加订单池数据
    async setPool(data, info, poolname)
    {
        const {app, ctx} = this;
        const redis = app.redis;
        const pre = this.poolname(poolname);
        const code = this.code();
        const field = code.field;
        const filter = code.filter;
        let fieldKey;
        let filterKey;
        let task = [];
        let status = true;
        if (typeof info !== 'object' || !info) {
            status = false;
        }
        for (let k in field) {
            if (parseInt(k) === 0) {
                fieldKey = pre;
            }
            if (!data[field[k]]) {
                status = false;
                break;
            }
            fieldKey += '-' + field[k] + '_' + data[field[k]];
        }
        let pool_keys = [];
        task.push(['rpush', pre, fieldKey]);
        pool_keys.push(pre);
        for (let v of filter) {
            if (data[v]) {
                if (Array.isArray(data[v])) {
                    for (let vv of data[v]) {
                        filterKey = pre + '-' + v + '_' + vv;
                        task.push(['rpush', filterKey, fieldKey]);
                        pool_keys.push(filterKey);
                    }
                } else {
                    filterKey = pre + '-' + v + '_' + data[v];
                    task.push(['rpush', filterKey, fieldKey]);
                    pool_keys.push(filterKey);
                }
            }
        }
        if (!status) {
            return false;
        }
        const res = await redis.multi(task).exec();
        const resLen = res.length;
        for (let i = 0;i < resLen;i++) {
            if (res[i][0]) {
                ctx.logger.error('setPool:' + ' ' + task[i] + '\n' + res[i][0]);
                await this.delPool(data);
                pool_keys = null;
                break;
            }
        }
        if (!pool_keys) {
            return false;
        }
        info['_' + pre] = pool_keys;
        info = JSON.stringify(info);
        await redis.set(fieldKey, info);
        return true;
    }

    //获取订单池单条数据
    async getPoolOne(data, poolname)
    {
        if (typeof data !== 'object') {
            return false;
        }
        const redis = this.app.redis;
        const pre = this.poolname(poolname);
        const field = this.code().field;
        let status = true;
        let fieldKey;
        for (let k in field) {
            if (parseInt(k) === 0) {
                fieldKey = pre;
            }
            if (!data[field[k]]) {
                status = false;
                break;
            }
            fieldKey += '-' + field[k] + '_' + data[field[k]];
        }
        if (!status) {
            return null;
        }
        const info = await redis.get(fieldKey);
        return info ? JSON.parse(info) : null;
    }

    //获取订单池分页列表
    async getPool(filter, page = '1', pageSize = '10', poolname)
    {
        if (typeof filter !== 'object' || !filter) {
            filter = {};
        }
        page = parseInt(page);
        pageSize = parseInt(pageSize);
        const redis = this.app.redis;
        const pre = this.poolname(poolname);
        const keys = Object.keys(filter);
        let arr = [];
        let filterKey;
        let dataArr = [];
        let currentKeys = [];
        if (keys.length > 0) {
            for (let k of keys) {
                filterKey = pre + '-' + k + '_' + filter[k];
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
        let sortField = this.code().field[0];
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
            meta: {
                total: num,
                perPage: pageSize,
                totalPages: Math.ceil(num / pageSize),
                currentPage: page,
                start: start + 1,
                end: end,
            },
        };
    }

    //删除订单池数据
    async delPool(data, poolname)
    {
        const redis = this.app.redis;
        const pre = this.poolname(poolname);
        const field = this.code().field;
        let status = true;
        let fieldKey;
        for (let k in field) {
            if (parseInt(k) === 0) {
                fieldKey = pre;
            }
            if (!data[field[k]]) {
                status = false;
                break;
            }
            fieldKey += '-' + field[k] + '_' + data[field[k]];
        }
        if (!status) {
            return false;
        }
        let task = [];
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

    //删除订单池
    async clearPool(poolname)
    {
        const redis = this.app.redis;
        const pre = this.poolname(poolname);
        const data = await redis.keys(pre + '-*');
        await redis.del(pre);
        if (data.length > 0) {
            await redis.del(data);
        }
    }
}

module.exports = PoolService;