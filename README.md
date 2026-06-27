# PSB 打卡文案工具

## 本地配置火山方舟

1. 打开 `.env`
2. 替换下面两项：

```env
ARK_API_KEY=你的火山方舟 API Key
ARK_MODEL=你的模型 ID 或推理接入点 ID
```

`ARK_BASE_URL` 默认使用：

```env
https://ark.cn-beijing.volces.com/api/v3
```

## 本地运行

```bash
npm start
```

然后打开：

```txt
http://localhost:3000
```

## Render 环境变量

部署到 Render 后，在服务的 Environment 里添加：

```env
ARK_API_KEY=你的火山方舟 API Key
ARK_MODEL=你的模型 ID 或推理接入点 ID
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
STATS_TOKEN=自己设置一个查看统计用的密码，可选
```

不要把真实 API Key 提交到 GitHub。

## 二维码扫码统计

生成二维码时，不要直接使用首页地址，改用统计入口：

```txt
https://你的域名/scan
```

用户扫码访问 `/scan` 时，服务端会记录 1 次扫描，然后自动跳转到首页。

查看统计：

```txt
https://你的域名/api/scan-stats
```

如果设置了 `STATS_TOKEN`，查看统计时使用：

```txt
https://你的域名/api/scan-stats?token=你的STATS_TOKEN
```

也可以给不同海报加来源参数，例如：

```txt
https://你的域名/scan?campaign=poster-a
```

当前统计会写入服务端本地 `data/scan-stats.json`。如果活动数据需要长期保留，建议在正式环境把 `DATA_DIR` 指向持久存储目录，或后续改接数据库。
