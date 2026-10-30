# AI 内容工厂（AI Content Factory）

一个基于 AI 的多平台内容自动生成与发布系统，支持小红书、微信公众号、今日头条、抖音等平台的内容自动化创作和定时发布。

## 功能特性

- **AI 智能选题**：根据内容赛道自动生成热门选题
- **多平台适配**：一篇内容自动适配小红书、公众号、头条、抖音等不同平台格式
- **定时自动发布**：支持自定义发布计划，每日自动生成并发布内容
- **多账号管理**：统一管理各平台账号，凭证加密存储
- **内容赛道**：支持知识科普、情感励志、赚钱创业、生活方式四大赛道
- **可视化管理**：现代化的 Web 管理界面

## 技术栈

### 后端
- Python 3.11+
- FastAPI - 高性能 Web 框架
- SQLAlchemy - ORM
- SQLite - 数据库（可切换为 MySQL/PostgreSQL）
- APScheduler - 任务调度
- PyCryptodome - 加密模块
- httpx - HTTP 客户端

### 前端
- React 18 + TypeScript
- Vite - 构建工具
- Tailwind CSS - 样式框架
- React Router v6 - 路由
- Axios - HTTP 客户端
- Lucide React - 图标库

### AI 服务
- DeepSeek - LLM（默认）
- 豆包/火山引擎 - LLM + 图片生成
- 可扩展的 Provider 架构

## 快速开始

### 环境要求
- Python 3.11+
- Node.js 18+
- npm 或 yarn

### 1. 克隆项目
```bash
cd ai-content-factory
```

### 2. 后端配置
```bash
cd backend

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，配置 LLM API Key 等

# 启动后端服务
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

后端 API 文档：http://localhost:8000/docs

### 3. 前端配置
```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端访问地址：http://localhost:5173

### 4. 默认登录
- 用户名：`admin`
- 密码：`admin123`

## 项目结构

```
.
├── backend/                 # 后端代码
│   ├── app/
│   │   ├── api/            # API 路由层
│   │   ├── models/         # 数据模型
│   │   ├── schemas/        # Pydantic Schema
│   │   ├── services/       # 业务服务
│   │   ├── providers/      # AI Provider 抽象层
│   │   ├── scheduler/      # 任务调度
│   │   ├── utils/          # 工具函数
│   │   ├── config.py       # 配置
│   │   ├── database.py     # 数据库
│   │   └── main.py         # 应用入口
│   ├── requirements.txt    # Python 依赖
│   └── .env.example        # 环境变量示例
├── frontend/               # 前端代码
│   ├── src/
│   │   ├── api/            # API 调用
│   │   ├── pages/          # 页面组件
│   │   ├── components/     # 公共组件
│   │   ├── layouts/        # 布局组件
│   │   └── store/          # 状态管理
│   ├── package.json
│   └── tailwind.config.js
└── README.md
```

## API 概览

| 模块 | 端点 | 说明 |
|------|------|------|
| 认证 | `POST /api/v1/auth/login` | 用户登录 |
| 内容 | `GET /api/v1/contents` | 内容列表 |
| 内容 | `POST /api/v1/contents/generate` | AI 生成内容 |
| 内容 | `GET/PUT/DELETE /api/v1/contents/{id}` | 内容详情/更新/删除 |
| 账号 | `GET /api/v1/accounts` | 账号列表 |
| 账号 | `POST /api/v1/accounts` | 创建账号 |
| 账号 | `POST /api/v1/accounts/{id}/test` | 测试账号 |
| 发布计划 | `GET /api/v1/schedules` | 计划列表 |
| 发布计划 | `POST /api/v1/schedules` | 创建计划 |
| 发布计划 | `POST /api/v1/schedules/{id}/toggle` | 启停计划 |
| 发布记录 | `GET /api/v1/publish/records` | 发布记录 |
| 系统 | `GET /api/v1/system/stats` | 系统统计 |

## 配置说明

### 环境变量（backend/.env）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `APP_NAME` | 应用名称 | AI Content Factory |
| `APP_ENV` | 运行环境 | development |
| `DATABASE_URL` | 数据库连接 | sqlite:///./content_factory.db |
| `SECRET_KEY` | 加密密钥 | 请修改为随机字符串 |
| `ENCRYPTION_KEY` | 凭证加密密钥 | 请修改为32位字符串 |
| `ADMIN_USERNAME` | 管理员用户名 | admin |
| `ADMIN_PASSWORD` | 管理员密码 | admin123 |
| `LLM_PROVIDER` | LLM 服务商 | deepseek |
| `LLM_API_KEY` | LLM API Key | - |
| `LLM_BASE_URL` | LLM API 地址 | https://api.deepseek.com/v1 |
| `LLM_MODEL` | LLM 模型 | deepseek-chat |
| `IMAGE_PROVIDER` | 图片生成服务商 | doubao |
| `IMAGE_API_KEY` | 图片 API Key | - |

## 支持的内容赛道

1. **知识科普** - 冷知识、科学现象、历史故事、生活百科、心理学、宇宙探索
2. **情感励志** - 情感故事、人生感悟、励志语录、成长思考、人际关系、自我提升
3. **赚钱创业** - 副业思路、创业故事、财富思维、职场提升、投资理财、商业洞察
4. **生活方式** - 美食推荐、旅行攻略、穿搭技巧、家居好物、健康生活、效率工具

## 支持的平台

- **小红书** - 图文笔记格式
- **微信公众号** - 长文格式
- **今日头条** - 文章格式
- **抖音** - 短视频文案+脚本

## 使用流程

1. **配置 AI 服务**：在 `backend/.env` 中配置 LLM API Key
2. **添加平台账号**：在「账号管理」中添加各平台账号
3. **创建发布计划**：在「发布计划」中设置内容赛道、发布时间、目标平台
4. **启动自动创作**：启用发布计划，系统将每日自动生成内容并发布
5. **查看效果**：在「发布记录」中查看发布状态和数据

## 注意事项

- MVP 阶段发布功能为模拟实现，真实发布需要对接各平台 API
- 图片生成功能为占位实现，后续可接入真实的图片生成服务
- 请妥善保管 API Key 和加密密钥，不要提交到公开仓库
- 生产环境请修改默认的管理员密码和加密密钥

## 许可证

MIT License
