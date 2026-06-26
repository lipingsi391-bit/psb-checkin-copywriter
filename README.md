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
```

不要把真实 API Key 提交到 GitHub。
