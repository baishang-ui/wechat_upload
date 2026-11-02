# 微信小程序共用质检后端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让微信小程序通过 `https://example.invalid` 使用 Smart Sales System 的 Session 认证、采购质检、独立质检、草稿与历史能力，同时移除客户端和后端源码中的数据库/模型密钥与通用密码风险。

**Architecture:** 后端扩展现有 `QualityInspectionTask`，以 `source_type` 区分采购任务和独立报告，并通过 `client_record_id` 实现独立报告幂等；新增严格的共享 Session 认证服务、小程序 JSON 认证路由和图片识别代理。小程序增加统一 HTTPS/Cookie 请求层、登录页、三栏目工作区与本地同步状态机；识别结果先落本地，再创建或更新后端质检草稿。

**Tech Stack:** Python 3、FastAPI、Starlette SessionMiddleware、SQLAlchemy、pytest、SQLite/MySQL；微信小程序 TypeScript、WXML、SCSS、`wx.request`、`wx.uploadFile`、Node test runner、TypeScript 5.5。

## Global Constraints

- 小程序只能访问 `https://example.invalid`，不得直连 MySQL，也不得再直连 8865 大模型接口。
- MySQL 用户名、密码、Session 密钥和大模型 API 密钥只能来自服务器环境变量，不得写入小程序、源码默认值、日志或响应。
- `source_type` 只能为 `purchase_order` 或 `standalone`；旧 Web 列表未传参数时必须继续默认 `purchase_order`。
- `purchase_order` 任务必须有 `purchase_order_id`；`standalone` 任务不得关联采购单且必须有 UUID 格式的 `client_record_id`。
- 相同 `client_record_id` 与相同规范化创建字段返回已有任务；内容不同返回 HTTP `409`，不得覆盖。
- 所有质检读写接口每次请求都重新查询用户状态和 `procurement` 权限；不得复用本地自动管理员登录旁路。
- 识别上传只接受 JPEG/PNG，最大 `600 KB`；普通请求超时 `30 s`，识别请求超时 `120 s`。
- 本地同步状态只能为 `local | syncing | synced | failed`；同步失败必须保留图片、识别原文和可编辑报告数据。
- 两个仓库分别测试、分别提交；执行前重新检查状态，不得提交、还原或覆盖用户已有修改。
- 后端本地测试必须显式使用 `DB_BACKEND=sqlite`；生产迁移前必须备份 MySQL。

## Execution preflight

执行实现前先使用 `superpowers:using-git-worktrees` 为两个仓库建立隔离工作树；如果当前工作区仍然干净，也不得跳过状态检查。

```bash
git -C $HOME/smart_sales_system status --short --branch
git -C $HOME/WeChatProjects/miniprogram-2 status --short --branch
cd $HOME/smart_sales_system && SESSION_SECRET_KEY=test-only-secret DB_BACKEND=sqlite pytest -q
cd $HOME/WeChatProjects/miniprogram-2 && npm test
cd $HOME/WeChatProjects/miniprogram-2 && npm run typecheck
```

预期：两个仓库没有非预期修改；后端测试、小程序测试和类型检查均通过。任何基线失败都先记录并与本功能修改隔离，不得通过删除测试或放宽断言掩盖。

## Locked file structure

### Smart Sales System

- Create `services/session_auth.py`：唯一的密码认证、Session hydration、账号状态复查、权限校验、失败限流和登录审计入口。
- Create `routes/miniprogram.py`：小程序 JSON 登录、当前用户、登出、质检识别路由；不承载数据库迁移或业务序列化。
- Create `services/miniprogram_inspection_recognition.py`：上传图片验证、视觉提示词、模型调用、JSON 提取和 `RawApiRecord` 校验。
- Modify `models.py`：仅修改 `QualityInspectionTask` 的来源、幂等和 nullable 字段。
- Modify `database.py`：新增可重复执行的质检表迁移，分别处理 SQLite 重建与 MySQL `MODIFY COLUMN purchase_order_id NULL` / `MODIFY COLUMN contract_no NULL`。
- Create `scripts/maintenance/migrate_quality_inspection_sources.py`：部署前显式迁移和校验命令，不保存数据库凭据。
- Modify `routes/customer_orders.py`：质检权限门、来源过滤、独立任务创建、nullable 安全序列化及现有草稿/签字/PDF 复用。
- Modify `main.py`：环境变量 Session 密钥、共享认证服务、注册小程序 router，移除通用密码分支。
- Modify `routes/users.py`：Web 登录改用共享认证服务并移除通用密码分支。
- Modify `services/llm_client.py`：删除内置 API key 回退，只读取环境变量。
- Modify `.env.example`：增加 `SESSION_SECRET_KEY`、登录限流与识别上传配置示例，所有敏感值为空或说明性占位文本。
- Create `tests/test_secret_configuration.py`、`tests/test_session_auth.py`、`tests/test_miniprogram_auth_api.py`、`tests/test_quality_inspection_schema_migration.py`、`tests/test_quality_inspection_standalone_api.py`、`tests/test_quality_inspection_sources_api.py`、`tests/test_miniprogram_inspection_recognition.py`。

### 微信小程序

- Create `miniprogram/config/server.ts`：唯一后端基础地址、超时、Cookie storage key。
- Create `miniprogram/services/server-client.ts`：可注入的 `wx.request`/`wx.uploadFile` adapter、Cookie 生命周期、统一错误映射。
- Create `miniprogram/services/auth-service.ts`：登录、me、logout 与登录态恢复。
- Create `miniprogram/services/quality-inspection-service.ts`：后端质检 DTO、字段映射、列表/详情/独立创建/草稿/识别 API。
- Modify `miniprogram/services/inspection-service.ts`：保留图片压缩和记录校验；识别委托给后端服务，删除 8865/token 逻辑；本地提交编号逻辑移出。
- Modify `miniprogram/domain/inspection-history.ts`：升级为 v2 记录结构、稳定 UUID、四态同步状态和 v1 兼容迁移。
- Modify `miniprogram/services/history-service.ts`：读取 v1、写 v2、同步状态更新、失败原因与服务端标识持久化。
- Create `miniprogram/pages/login/login.ts|wxml|scss|json`：账号密码登录，不持久化密码。
- Modify `miniprogram/app.json`：登录页排在首页之前并保留首页、日志页注册。
- Modify `miniprogram/pages/index/index.ts|wxml|scss|json`：扫描识别、待检任务、历史记录三栏目，以及保存/重试闭环。
- Create `tests/server-client.test.ts`、`tests/auth-service.test.ts`、`tests/quality-inspection-service.test.ts`；扩展 `tests/inspection-service.test.ts`、`tests/inspection-history.test.ts`、`tests/history-service.test.ts`。

---

### Task 1: 后端敏感配置与共享 Session 认证服务

**Files:**
- Create: `$HOME/smart_sales_system/services/session_auth.py`
- Modify: `$HOME/smart_sales_system/main.py:1-190, 640-690`
- Modify: `$HOME/smart_sales_system/routes/users.py:330-375`
- Modify: `$HOME/smart_sales_system/services/llm_client.py:1-80`
- Modify: `$HOME/smart_sales_system/.env.example`
- Test: `$HOME/smart_sales_system/tests/test_secret_configuration.py`
- Test: `$HOME/smart_sales_system/tests/test_session_auth.py`

**Interfaces:**
- Consumes: `models.User`, `models.AuditLog`, `database.get_session`, `utils.auth.verify_password`, `routes.users._get_permissions`, `routes.users._ensure_user_gender`.
- Produces: `SessionUser`, `AuthenticationError`, `RateLimitError`, `authenticate_credentials(username: str, password: str, ip_address: str, now: datetime | None = None) -> SessionUser`, `hydrate_session(request: Request, user: SessionUser) -> None`, `require_session_user(request: Request, permission: str | None = None) -> SessionUser`.

- [ ] **Step 1: 写敏感配置静态回归测试**

```python
# tests/test_secret_configuration.py
import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _tree(relative: str) -> ast.AST:
    return ast.parse((ROOT / relative).read_text(encoding="utf-8"))


def test_session_middleware_secret_is_not_a_string_literal():
    tree = _tree("main.py")
    calls = [node for node in ast.walk(tree) if isinstance(node, ast.Call)]
    middleware_calls = [node for node in calls if getattr(node.func, "attr", "") == "add_middleware"]
    secret_values = [
        keyword.value
        for call in middleware_calls
        for keyword in call.keywords
        if keyword.arg == "secret_key"
    ]
    assert secret_values
    assert all(not isinstance(value, ast.Constant) or not isinstance(value.value, str) for value in secret_values)


def test_login_routes_do_not_compare_password_to_a_literal():
    for relative in ("main.py", "routes/users.py"):
        tree = _tree(relative)
        comparisons = [node for node in ast.walk(tree) if isinstance(node, ast.Compare)]
        assert not any(
            isinstance(node.left, ast.Name)
            and node.left.id == "password"
            and any(isinstance(item, ast.Constant) and isinstance(item.value, str) for item in node.comparators)
            for node in comparisons
        )


def test_llm_client_has_no_secret_shaped_default():
    source = (ROOT / "services/llm_client.py").read_text(encoding="utf-8")
    assert "os.getenv(\"MOONSHOT_API_KEY\", \"sk-" not in source
    assert "os.environ.setdefault(\"MOONSHOT_API_KEY\"" not in source
```

- [ ] **Step 2: 运行静态测试并确认当前实现失败**

Run: `cd $HOME/smart_sales_system && DB_BACKEND=sqlite pytest tests/test_secret_configuration.py -q`

Expected: FAIL；至少命中 Session 字面量、登录密码字面量比较或模型 key 默认值中的现存风险。

- [ ] **Step 3: 写共享认证服务的失败测试**

```python
# tests/test_session_auth.py
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from database import get_session, init_databases
from models import AuditLog, User
from services.session_auth import (
    AuthenticationError,
    RateLimitError,
    authenticate_credentials,
    require_session_user,
)
from utils.auth import hash_password


def _request(session_data: dict) -> Request:
    scope = {"type": "http", "method": "GET", "path": "/", "headers": [], "session": session_data}
    return Request(scope)


def _create_user(username: str, *, status: str = "active", permissions: str = '["procurement"]') -> User:
    session = get_session("users")
    user = User(
        username=username,
        password=hash_password("correct-password"),
        real_name="质检员",
        role="sales",
        status=status,
        permissions=permissions,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    session.expunge(user)
    session.close()
    return user


def test_authenticate_credentials_rejects_wrong_password_without_storing_password():
    init_databases()
    _create_user("wrong-password-user")
    with pytest.raises(AuthenticationError):
        authenticate_credentials("wrong-password-user", "wrong-password", "203.0.113.10")
    session = get_session("users")
    log = session.query(AuditLog).filter(AuditLog.action == "miniprogram_login_failed").order_by(AuditLog.id.desc()).first()
    session.close()
    assert log is not None
    assert "wrong-password" not in (log.detail or "")


def test_authenticate_credentials_blocks_sixth_failure_in_fifteen_minutes():
    init_databases()
    _create_user("limited-user")
    started = datetime(2026, 7, 22, 10, 0, 0)
    for offset in range(5):
        with pytest.raises(AuthenticationError):
            authenticate_credentials("limited-user", "bad", "203.0.113.11", started + timedelta(minutes=offset))
    with pytest.raises(RateLimitError):
        authenticate_credentials("limited-user", "bad", "203.0.113.11", started + timedelta(minutes=5))


def test_require_session_user_rechecks_status_and_permission():
    init_databases()
    user = _create_user("active-user")
    current = require_session_user(_request({"user_id": user.id}), "procurement")
    assert current.username == "active-user"
    session = get_session("users")
    stored = session.query(User).filter(User.id == user.id).one()
    stored.status = "rejected"
    session.commit()
    session.close()
    with pytest.raises(HTTPException) as exc_info:
        require_session_user(_request({"user_id": user.id}), "procurement")
    assert exc_info.value.status_code == 401
```

- [ ] **Step 4: 运行认证测试并确认模块尚不存在**

Run: `cd $HOME/smart_sales_system && DB_BACKEND=sqlite pytest tests/test_session_auth.py -q`

Expected: FAIL with `ModuleNotFoundError: No module named 'services.session_auth'`。

- [ ] **Step 5: 实现共享认证、环境变量 Session 和安全登录**

在 `services/session_auth.py` 固定以下公开契约和常量：

```python
from dataclasses import dataclass
from datetime import datetime, timedelta
import json
import os

from fastapi import HTTPException, Request

from database import get_session
from models import AuditLog, User
from utils.auth import verify_password

LOGIN_FAILURE_LIMIT = int(os.getenv("MINIPROGRAM_LOGIN_FAILURE_LIMIT", "5"))
LOGIN_FAILURE_WINDOW = timedelta(minutes=int(os.getenv("MINIPROGRAM_LOGIN_FAILURE_WINDOW_MINUTES", "15")))


@dataclass(frozen=True)
class SessionUser:
    id: int
    username: str
    real_name: str
    role: str
    permissions: tuple[str, ...]
    avatar_url: str


class AuthenticationError(ValueError):
    pass


class RateLimitError(ValueError):
    pass


def authenticate_credentials(username: str, password: str, ip_address: str, now: datetime | None = None) -> SessionUser:
    moment = now or datetime.now()
    normalized_username = username.strip()
    session = get_session("users")
    try:
        recent_failures = session.query(AuditLog).filter(
            AuditLog.action == "miniprogram_login_failed",
            AuditLog.user_name == normalized_username,
            AuditLog.ip_address == ip_address,
            AuditLog.created_at >= moment - LOGIN_FAILURE_WINDOW,
        ).count()
        if recent_failures >= LOGIN_FAILURE_LIMIT:
            raise RateLimitError("登录失败次数过多，请 15 分钟后重试")
        user = session.query(User).filter(User.username == normalized_username).first()
        if not user or not verify_password(password, user.password):
            session.add(AuditLog(
                user_id=user.id if user else 0,
                user_name=normalized_username,
                action="miniprogram_login_failed",
                target_type="authentication",
                detail=json.dumps({"reason": "invalid_credentials"}, ensure_ascii=False),
                ip_address=ip_address,
                created_at=moment,
            ))
            session.commit()
            raise AuthenticationError("用户名或密码错误")
        if (user.status or "active") != "active":
            raise AuthenticationError("账号不可用")
        from routes.users import _get_permissions
        permissions = tuple(_get_permissions(user))
        return SessionUser(user.id, user.username, user.real_name, user.role, permissions, user.avatar_url or "")
    finally:
        session.close()
```

同文件补齐：

- `hydrate_session()` 只写 `user_id`、`username`、`real_name`、`role`、`permissions`、`avatar_url`；
- `require_session_user()` 从 Session 取 `user_id`，重新查询 `User`，校验 `status == active`，重新计算权限；未登录/用户消失/账号禁用抛 `HTTPException(401, "未登录")`，缺权限抛 `HTTPException(403, "无质量检验权限")`；
- `main.py` 使用 `SESSION_SECRET_KEY = os.environ["SESSION_SECRET_KEY"]`，缺失时启动失败，不提供源码默认值；`SessionMiddleware` 使用 `https_only=os.getenv("SESSION_COOKIE_HTTPS_ONLY", "1") != "0"`、`same_site="lax"` 和 `max_age=86400`；
- `main.py` 和 `routes/users.py` 的 Web 登录都调用 `authenticate_credentials()`，删除任何密码字面量绕过；
- `services/llm_client.py` 的云端 key 只用 `os.getenv("MOONSHOT_API_KEY") or os.getenv("CLOUD_LLM_API_KEY")`；
- `.env.example` 增加 `SESSION_SECRET_KEY=`、`SESSION_COOKIE_HTTPS_ONLY=1`、`MINIPROGRAM_LOGIN_FAILURE_LIMIT=5`、`MINIPROGRAM_LOGIN_FAILURE_WINDOW_MINUTES=15`，真实部署值不提交。

- [ ] **Step 6: 运行聚焦测试**

Run: `cd $HOME/smart_sales_system && SESSION_SECRET_KEY=test-only-secret DB_BACKEND=sqlite pytest tests/test_secret_configuration.py tests/test_session_auth.py -q`

Expected: PASS。

- [ ] **Step 7: 提交后端认证安全改动**

```bash
cd $HOME/smart_sales_system
git add services/session_auth.py main.py routes/users.py services/llm_client.py .env.example tests/test_secret_configuration.py tests/test_session_auth.py
git commit -m "security: harden shared session authentication"
```

---

### Task 2: 小程序 JSON 登录、me 与 logout API

**Files:**
- Create: `$HOME/smart_sales_system/routes/miniprogram.py`
- Modify: `$HOME/smart_sales_system/main.py:445-505`
- Test: `$HOME/smart_sales_system/tests/test_miniprogram_auth_api.py`

**Interfaces:**
- Consumes: Task 1 的 `authenticate_credentials()`、`hydrate_session()`、`require_session_user()`。
- Produces: `POST /api/miniprogram/auth/login`、`GET /api/miniprogram/auth/me`、`POST /api/miniprogram/auth/logout`；统一响应 `{success, data?}` 或 `{success: false, error: string}`。

- [ ] **Step 1: 写认证 API 失败测试**

```python
# tests/test_miniprogram_auth_api.py
from fastapi.testclient import TestClient

from database import get_session, init_databases
from main import app
from models import User
from utils.auth import hash_password


def _user(username: str, status: str = "active", permissions: str = '["procurement"]') -> None:
    session = get_session("users")
    session.add(User(username=username, password=hash_password("pass-123"), real_name="测试用户", role="sales", status=status, permissions=permissions))
    session.commit()
    session.close()


def test_login_sets_cookie_and_me_rechecks_user():
    init_databases()
    _user("mini-user")
    with TestClient(app, base_url="https://fixture-ebdab7.example.invalid") as client:
        login = client.post("/api/miniprogram/auth/login", json={"username": "mini-user", "password": "pass-123"})
        assert login.status_code == 200
        assert login.json()["data"]["user"]["username"] == "mini-user"
        assert "session=" in login.headers["set-cookie"]
        me = client.get("/api/miniprogram/auth/me")
        assert me.status_code == 200
        assert me.json()["data"]["user"]["permissions"] == ["procurement"]


def test_login_rejects_invalid_or_inactive_user():
    init_databases()
    _user("inactive-user", status="rejected")
    with TestClient(app, base_url="https://fixture-ebdab7.example.invalid") as client:
        wrong = client.post("/api/miniprogram/auth/login", json={"username": "missing", "password": "bad"})
        inactive = client.post("/api/miniprogram/auth/login", json={"username": "inactive-user", "password": "pass-123"})
    assert wrong.status_code == 401
    assert inactive.status_code == 401


def test_logout_clears_session():
    init_databases()
    _user("logout-user")
    with TestClient(app, base_url="https://fixture-ebdab7.example.invalid") as client:
        client.post("/api/miniprogram/auth/login", json={"username": "logout-user", "password": "pass-123"})
        assert client.post("/api/miniprogram/auth/logout").status_code == 200
        me = client.get("/api/miniprogram/auth/me")
        assert me.status_code == 401
        assert me.json() == {"success": False, "error": "未登录"}
```

- [ ] **Step 2: 运行测试确认路由不存在**

Run: `cd $HOME/smart_sales_system && SESSION_SECRET_KEY=test-only-secret DB_BACKEND=sqlite pytest tests/test_miniprogram_auth_api.py -q`

Expected: FAIL with HTTP `404`。

- [ ] **Step 3: 实现 JSON 路由和异常映射**

```python
# routes/miniprogram.py
from pydantic import BaseModel, Field
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from services.session_auth import AuthenticationError, RateLimitError, authenticate_credentials, hydrate_session, require_session_user

router = APIRouter(prefix="/api/miniprogram", tags=["miniprogram"])


class LoginPayload(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=256)


def _user_data(user):
    return {"id": user.id, "username": user.username, "real_name": user.real_name, "role": user.role, "permissions": list(user.permissions), "avatar_url": user.avatar_url}


@router.post("/auth/login")
async def login(request: Request, body: LoginPayload):
    ip_address = request.client.host if request.client else ""
    try:
        user = authenticate_credentials(body.username, body.password, ip_address)
    except RateLimitError as exc:
        return JSONResponse({"success": False, "error": str(exc)}, status_code=429)
    except AuthenticationError as exc:
        return JSONResponse({"success": False, "error": str(exc)}, status_code=401)
    hydrate_session(request, user)
    return {"success": True, "data": {"user": _user_data(user)}}


@router.get("/auth/me")
async def me(request: Request):
    user = require_session_user(request)
    return {"success": True, "data": {"user": _user_data(user)}}


@router.post("/auth/logout")
async def logout(request: Request):
    request.session.clear()
    return {"success": True, "data": {}}
```

在 `main.py` 导入并执行 `app.include_router(miniprogram_router)`；新增全局 `HTTPException` JSON 映射时，对 `/api/miniprogram/` 以及路径中包含 `/customer-orders/api/` 和 `/quality-inspections` 的请求返回 `{success: false, error: detail}`，其余路由保持原有 HTML 或 `{detail: ...}` 行为。

- [ ] **Step 4: 运行认证 API 测试**

Run: `cd $HOME/smart_sales_system && SESSION_SECRET_KEY=test-only-secret DB_BACKEND=sqlite pytest tests/test_miniprogram_auth_api.py tests/test_session_auth.py -q`

Expected: PASS。

- [ ] **Step 5: 提交 JSON 认证 API**

```bash
cd $HOME/smart_sales_system
git add routes/miniprogram.py main.py tests/test_miniprogram_auth_api.py
git commit -m "feat: add miniprogram session auth API"
```

---

### Task 3: 质检来源模型与 SQLite/MySQL 幂等迁移

**Files:**
- Modify: `$HOME/smart_sales_system/models.py:1917-1945`
- Modify: `$HOME/smart_sales_system/database.py:330-430, 1364-1490`
- Create: `$HOME/smart_sales_system/scripts/maintenance/migrate_quality_inspection_sources.py`
- Test: `$HOME/smart_sales_system/tests/test_quality_inspection_schema_migration.py`

**Interfaces:**
- Consumes: `db_manager.engines["customer_orders"]`、`CustomerOrdersBase.metadata`。
- Produces: `migrate_quality_inspection_task_schema(engine) -> None`，可在 SQLite 和 MySQL 重复执行；模型字段 `source_type: str`、`client_record_id: str | None`。

- [ ] **Step 1: 写模型和 SQLite 迁移失败测试**

```python
# tests/test_quality_inspection_schema_migration.py
from sqlalchemy import create_engine, inspect, text

from database import migrate_quality_inspection_task_schema


def _legacy_sqlite_engine():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE quality_inspection_tasks (id INTEGER PRIMARY KEY, task_no VARCHAR NOT NULL UNIQUE, purchase_order_id INTEGER NOT NULL UNIQUE, contract_no VARCHAR NOT NULL)"))
        conn.execute(text("INSERT INTO quality_inspection_tasks (id, task_no, purchase_order_id, contract_no) VALUES (1, 'QI-1', 10, 'PO-10')"))
    return engine


def test_sqlite_migration_adds_sources_and_nullable_purchase_fields_idempotently():
    engine = _legacy_sqlite_engine()
    migrate_quality_inspection_task_schema(engine)
    migrate_quality_inspection_task_schema(engine)
    columns = {column["name"]: column for column in inspect(engine).get_columns("quality_inspection_tasks")}
    assert columns["source_type"]["nullable"] is False
    assert columns["purchase_order_id"]["nullable"] is True
    assert columns["contract_no"]["nullable"] is True
    with engine.begin() as conn:
        row = conn.execute(text("SELECT source_type, client_record_id FROM quality_inspection_tasks WHERE id=1")).one()
        conn.execute(text("INSERT INTO quality_inspection_tasks (id, task_no, purchase_order_id, contract_no, source_type, client_record_id) VALUES (2, 'QI-2', NULL, NULL, 'standalone', '550e8400-e29b-41d4-a716-446655440000')"))
    assert row.source_type == "purchase_order"
    assert row.client_record_id is None
```

为 MySQL SQL 生成单独测试，将 fake connection 收集到的语句断言包含：

```python
assert "MODIFY purchase_order_id INTEGER NULL" in statements
assert "MODIFY contract_no VARCHAR" in "\n".join(statements)
assert any("CREATE UNIQUE INDEX" in statement and "client_record_id" in statement for statement in statements)
```

- [ ] **Step 2: 运行迁移测试确认函数不存在**

Run: `cd $HOME/smart_sales_system && SESSION_SECRET_KEY=test-only-secret DB_BACKEND=sqlite pytest tests/test_quality_inspection_schema_migration.py -q`

Expected: FAIL with import error for `migrate_quality_inspection_task_schema`。

- [ ] **Step 3: 修改 SQLAlchemy 模型**

```python
class QualityInspectionTask(CustomerOrdersBase):
    __tablename__ = "quality_inspection_tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_no = Column(String, unique=True, nullable=False, index=True)
    source_type = Column(String(32), nullable=False, default="purchase_order", index=True)
    client_record_id = Column(String(36), nullable=True, unique=True, index=True)
    purchase_order_id = Column(Integer, nullable=True, unique=True, index=True)
    contract_no = Column(String, nullable=True, index=True)
```

保留该类其余已有列原样；`QualityInspectionItem.purchase_order_item_id` 已是 nullable，不修改。

- [ ] **Step 4: 实现方言专用、重复执行安全的迁移**

在 `database.py` 实现：

- SQLite：读取 `PRAGMA table_info` 和 `PRAGMA index_list`；若 nullable 或新列不符合，创建 `quality_inspection_tasks__migrating`，按模型目标列复制数据并以 `COALESCE(source_type, 'purchase_order')` 回填，删除旧表并改名，随后恢复 `task_no`、`purchase_order_id`、`client_record_id` 的唯一索引和普通查询索引；迁移在单个 `engine.begin()` 事务内执行。
- MySQL：通过 inspector 判断列/索引是否存在，只执行必要的新增列、历史来源回填、nullable 列修改和唯一索引创建语句；使用方言 identifier preparer，不拼接外部输入。
- `init_databases()` 在 `CustomerOrdersBase.metadata.create_all()` 后调用该函数，确保新库创建与旧库升级都覆盖。
- 维护脚本只调用 `init_databases()` 和迁移函数，打印表结构校验摘要，不打印连接串或密码。

维护脚本入口固定为：

```python
from database import db_manager, init_databases, migrate_quality_inspection_task_schema


def main() -> int:
    init_databases()
    engine = db_manager.engines["customer_orders"]
    migrate_quality_inspection_task_schema(engine)
    print("quality_inspection_tasks migration verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 5: 运行迁移与模型测试**

Run: `cd $HOME/smart_sales_system && SESSION_SECRET_KEY=test-only-secret DB_BACKEND=sqlite pytest tests/test_quality_inspection_schema_migration.py -q`

Expected: PASS；重复迁移不报错，旧行被回填，独立任务可插入 NULL 采购字段。

- [ ] **Step 6: 提交模型和迁移**

```bash
cd $HOME/smart_sales_system
git add models.py database.py scripts/maintenance/migrate_quality_inspection_sources.py tests/test_quality_inspection_schema_migration.py
git commit -m "feat: migrate quality inspection task sources"
```

---

### Task 4: 统一质检权限门、来源过滤和 nullable 兼容

**Files:**
- Modify: `$HOME/smart_sales_system/routes/customer_orders.py:1032-1048, 2412-2680, 6124-6825`
- Test: `$HOME/smart_sales_system/tests/test_quality_inspection_sources_api.py`

**Interfaces:**
- Consumes: Task 1 的 `require_session_user(request, "procurement")`，Task 3 的模型字段。
- Produces: `_require_quality_inspection_access(request) -> SessionUser`；列表与历史接口接受 `source_type: Literal["purchase_order", "standalone", "all"] = "purchase_order"`；所有 task/item DTO 含 `source_type` 和 `client_record_id`。

- [ ] **Step 1: 写权限、默认过滤和 nullable 失败测试**

```python
# tests/test_quality_inspection_sources_api.py
from fastapi.testclient import TestClient

from database import get_session, init_databases
from main import app
from models import QualityInspectionItem, QualityInspectionTask, User
from utils.auth import hash_password


def _login(client: TestClient, permissions: str = '["procurement"]') -> None:
    session = get_session("users")
    user = User(username=f"u-{permissions}", password=hash_password("pass"), real_name="质检员", role="sales", status="active", permissions=permissions)
    session.add(user)
    session.commit()
    session.close()
    response = client.post("/api/miniprogram/auth/login", json={"username": user.username, "password": "pass"})
    assert response.status_code == 200


def _seed_sources() -> None:
    session = get_session("customer_orders")
    purchase = QualityInspectionTask(task_no="QI-P", source_type="purchase_order", purchase_order_id=1, contract_no="PO-1", status="pending")
    standalone = QualityInspectionTask(task_no="QI-S", source_type="standalone", client_record_id="550e8400-e29b-41d4-a716-446655440000", purchase_order_id=None, contract_no=None, status="pending")
    session.add_all([purchase, standalone])
    session.flush()
    session.add(QualityInspectionItem(task_id=standalone.id, purchase_order_item_id=None, material_name="钢丝刷", unit="Pcs", quantity=1))
    session.commit()
    session.close()


def test_quality_list_defaults_to_purchase_order_and_all_includes_nullable_standalone():
    init_databases()
    _seed_sources()
    with TestClient(app, base_url="https://fixture-ebdab7.example.invalid") as client:
        _login(client)
        default = client.get("/customer-orders/api/purchase-orders/quality-inspections")
        combined = client.get("/customer-orders/api/purchase-orders/quality-inspections?source_type=all")
    assert [item["source_type"] for item in default.json()["data"]["items"]] == ["purchase_order"]
    assert {item["source_type"] for item in combined.json()["data"]["items"]} == {"purchase_order", "standalone"}
    standalone = next(item for item in combined.json()["data"]["items"] if item["source_type"] == "standalone")
    assert standalone["purchase_order_id"] is None
    assert standalone["contract_no"] is None


def test_quality_routes_require_procurement_permission():
    init_databases()
    with TestClient(app, base_url="https://fixture-ebdab7.example.invalid") as client:
        _login(client, permissions="[]")
        response = client.get("/customer-orders/api/purchase-orders/quality-inspections")
    assert response.status_code == 403
    assert response.json() == {"success": False, "error": "无质量检验权限"}
```

同时为详情、草稿、签字、AI 判定和 PDF 各添加一个参数化权限断言，确保没有质检端点遗留 `_require_login_json()`。

- [ ] **Step 2: 运行测试确认默认列表仍混合来源或缺字段**

Run: `cd $HOME/smart_sales_system && SESSION_SECRET_KEY=test-only-secret DB_BACKEND=sqlite pytest tests/test_quality_inspection_sources_api.py -q`

Expected: FAIL；当前 serializer 无 `source_type`，列表无来源过滤，权限仅检查登录。

- [ ] **Step 3: 实现统一权限门和来源过滤**

```python
from typing import Literal
from services.session_auth import SessionUser, require_session_user


def _require_quality_inspection_access(request: Request) -> SessionUser:
    return require_session_user(request, "procurement")


def _apply_quality_source_filter(query, source_type: Literal["purchase_order", "standalone", "all"]):
    if source_type == "all":
        return query
    return query.filter(QualityInspectionTask.source_type == source_type)
```

具体修改：

- 所有 `/quality-inspections` 端点入口改用 `_require_quality_inspection_access()`；
- 列表、历史查询与 stats 使用同一来源过滤，避免列表显示采购数据但统计包含独立数据；
- `_quality_inspection_task_dict()` 增加 `source_type`、`client_record_id`；
- 搜索 `contract_no` 时允许 NULL；排序使用 `COALESCE(pushed_at, created_at)` 或先 `created_at` 后 `id`；
- `_quality_inspection_item_detail_dict()`、详情、草稿、签字、PDF 和产品信息组装先判断采购单/采购明细是否存在；独立任务返回空采购对象而不是解引用 NULL；
- 参数非法值由 FastAPI 返回 `422`。

- [ ] **Step 4: 运行来源、权限和现有质检回归测试**

Run: `cd $HOME/smart_sales_system && SESSION_SECRET_KEY=test-only-secret DB_BACKEND=sqlite pytest tests/test_quality_inspection_sources_api.py -q`

Expected: PASS。

- [ ] **Step 5: 提交来源过滤与权限改动**

```bash
cd $HOME/smart_sales_system
git add routes/customer_orders.py tests/test_quality_inspection_sources_api.py
git commit -m "feat: filter and authorize quality inspection sources"
```

---

### Task 5: 独立报告创建与 `client_record_id` 幂等

**Files:**
- Modify: `$HOME/smart_sales_system/routes/customer_orders.py:2140-2200, 2346-2385, 6070-6124`
- Test: `$HOME/smart_sales_system/tests/test_quality_inspection_standalone_api.py`

**Interfaces:**
- Consumes: `_generate_quality_inspection_task_no()`、`_quality_inspection_task_dict()`、`_require_quality_inspection_access()`。
- Produces: `StandaloneQualityInspectionPayload`；`POST /customer-orders/api/quality-inspections/standalone` 返回 `data.task_id`、`data.item_id`、`data.task`。

- [ ] **Step 1: 写创建、重复和冲突测试**

```python
# tests/test_quality_inspection_standalone_api.py
from fastapi.testclient import TestClient

from database import get_session, init_databases
from main import app
from models import QualityInspectionTask, User
from utils.auth import hash_password

PAYLOAD = {
    "client_record_id": "550e8400-e29b-41d4-a716-446655440000",
    "customer_name": "客户名称",
    "supplier_name": "供应商名称",
    "inspection_date": "2026-07-22",
    "material_code": "",
    "material_name": "钢丝刷",
    "spec_desc": "100x20",
    "quantity": 1000,
    "unit": "Pcs",
    "packaging_method": "纸箱",
    "notes": "到货抽检",
}


def test_standalone_create_is_idempotent_and_conflicting_content_returns_409(authenticated_client: TestClient):
    first = authenticated_client.post("/customer-orders/api/quality-inspections/standalone", json=PAYLOAD)
    second = authenticated_client.post("/customer-orders/api/quality-inspections/standalone", json=PAYLOAD)
    conflict = authenticated_client.post(
        "/customer-orders/api/quality-inspections/standalone",
        json={**PAYLOAD, "quantity": 2000},
    )
    assert first.status_code == 201
    assert second.status_code == 200
    assert first.json()["data"]["task_id"] == second.json()["data"]["task_id"]
    assert first.json()["data"]["item_id"] == second.json()["data"]["item_id"]
    assert conflict.status_code == 409
    session = get_session("customer_orders")
    assert session.query(QualityInspectionTask).filter_by(client_record_id=PAYLOAD["client_record_id"]).count() == 1
    session.close()
```

在同文件提供 `authenticated_client` fixture：初始化数据库、创建拥有 `procurement` 的用户并通过 JSON 登录；另测无效 UUID 为 `422`、无权限为 `403`。

- [ ] **Step 2: 运行测试确认端点不存在**

Run: `cd $HOME/smart_sales_system && SESSION_SECRET_KEY=test-only-secret DB_BACKEND=sqlite pytest tests/test_quality_inspection_standalone_api.py -q`

Expected: FAIL with HTTP `404`。

- [ ] **Step 3: 实现精确请求模型和规范化比较**

```python
class StandaloneQualityInspectionPayload(BaseModel):
    client_record_id: UUID
    customer_name: str = Field(default="", max_length=255)
    supplier_name: str = Field(default="", max_length=255)
    inspection_date: date
    material_code: str = Field(default="", max_length=255)
    material_name: str = Field(min_length=1, max_length=255)
    spec_desc: str = ""
    quantity: float = Field(default=0, ge=0)
    unit: str = Field(default="Pcs", min_length=1, max_length=32)
    packaging_method: str = ""
    notes: str = ""


def _standalone_signature(task: QualityInspectionTask, item: QualityInspectionItem) -> dict:
    return {
        "customer_name": _quality_inspection_safe_text(task.customer_name),
        "supplier_name": _quality_inspection_safe_text(task.supplier_name),
        "inspection_date": task.signed_date.isoformat() if task.signed_date else "",
        "material_code": _quality_inspection_safe_text(item.material_code),
        "material_name": _quality_inspection_safe_text(item.material_name),
        "spec_desc": _quality_inspection_safe_text(item.spec_desc),
        "quantity": float(item.quantity or 0),
        "unit": _quality_inspection_safe_text(item.unit) or "Pcs",
        "packaging_method": _quality_inspection_safe_text(item.packaging_method),
        "notes": _quality_inspection_safe_text(task.inspection_notes),
    }
```

端点逻辑必须：

1. 开启 customer_orders session 后先按 UUID 字符串查询；
2. 已存在时加载唯一明细，比较上述规范化 signature；相同返回 `200`，不同返回 `409`；
3. 新建 task：`source_type="standalone"`、采购字段为 NULL、`signed_date=inspection_date`、`status="pending"`、`pushed_by=current_user.id`、`pushed_at=datetime.now()`；
4. 新建一个 `purchase_order_item_id=None` 的 item；
5. flush 后返回完整 DTO，commit；
6. 捕获并发唯一索引 `IntegrityError` 时 rollback、重新查询并执行相同 signature 比较，不把数据库错误文本返回客户端。

- [ ] **Step 4: 运行独立报告测试**

Run: `cd $HOME/smart_sales_system && SESSION_SECRET_KEY=test-only-secret DB_BACKEND=sqlite pytest tests/test_quality_inspection_standalone_api.py tests/test_quality_inspection_sources_api.py -q`

Expected: PASS。

- [ ] **Step 5: 提交独立报告 API**

```bash
cd $HOME/smart_sales_system
git add routes/customer_orders.py tests/test_quality_inspection_standalone_api.py
git commit -m "feat: create idempotent standalone inspections"
```

---

### Task 6: 小程序图片识别代理

**Files:**
- Create: `$HOME/smart_sales_system/services/miniprogram_inspection_recognition.py`
- Modify: `$HOME/smart_sales_system/routes/miniprogram.py`
- Modify: `$HOME/smart_sales_system/.env.example`
- Test: `$HOME/smart_sales_system/tests/test_miniprogram_inspection_recognition.py`

**Interfaces:**
- Consumes: `services.llm_client.call_llm(messages: list[dict], *, model: str | None = None, temperature: float = 0.1, timeout: float = 600.0) -> str`、`require_session_user(request, "procurement")`。
- Produces: `recognize_inspection_image(content: bytes, content_type: str) -> dict`；multipart 字段名 `file`；成功响应 `{success: true, data: {record: RawApiRecord, raw_content: string}}`。

- [ ] **Step 1: 写 MIME、大小、权限和模型异常测试**

```python
# tests/test_miniprogram_inspection_recognition.py
import json
from fastapi.testclient import TestClient

from main import app


def test_recognize_rejects_unsupported_type_and_oversized_image(authenticated_client: TestClient):
    wrong = authenticated_client.post(
        "/api/miniprogram/quality-inspections/recognize",
        files={"file": ("report.gif", b"gif", "image/gif")},
    )
    large = authenticated_client.post(
        "/api/miniprogram/quality-inspections/recognize",
        files={"file": ("report.jpg", b"x" * (600 * 1024 + 1), "image/jpeg")},
    )
    assert wrong.status_code == 400
    assert large.status_code == 413


def test_recognize_returns_raw_api_record(authenticated_client: TestClient, monkeypatch):
    model_record = {"report_title": "钢丝刷检验记录单", "customer": "客户A", "supplier": "供应商A", "model_spec": "100x20", "inspection_date": "2026-07-22", "items": [{"name": "材质", "measurements": ["OK"]}], "sample_judgements": ["OK"]}
    monkeypatch.setattr("services.miniprogram_inspection_recognition.call_llm", lambda messages, **kwargs: json.dumps(model_record, ensure_ascii=False))
    response = authenticated_client.post(
        "/api/miniprogram/quality-inspections/recognize",
        files={"file": ("report.jpg", b"jpeg-bytes", "image/jpeg")},
    )
    assert response.status_code == 200
    assert response.json()["data"]["record"] == model_record


def test_recognize_maps_invalid_model_json_to_502(authenticated_client: TestClient, monkeypatch):
    monkeypatch.setattr("services.miniprogram_inspection_recognition.call_llm", lambda messages, **kwargs: "not-json")
    response = authenticated_client.post(
        "/api/miniprogram/quality-inspections/recognize",
        files={"file": ("report.png", b"png-bytes", "image/png")},
    )
    assert response.status_code == 502
    assert response.json() == {"success": False, "error": "识别服务返回了无效数据"}
```

- [ ] **Step 2: 运行测试确认识别端点不存在**

Run: `cd $HOME/smart_sales_system && SESSION_SECRET_KEY=test-only-secret DB_BACKEND=sqlite pytest tests/test_miniprogram_inspection_recognition.py -q`

Expected: FAIL with HTTP `404`。

- [ ] **Step 3: 实现图片验证、模型调用和 JSON schema 校验**

服务函数固定常量：

```python
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png"}
MAX_IMAGE_BYTES = 600 * 1024
VISION_MODEL = os.getenv("LLM_VL_MODEL", "qwen35")
```

实现要求：

- MIME 不在集合抛 `RecognitionInputError`；内容超过上限抛 `RecognitionTooLargeError`；
- 图片编码为 data URL，只传给服务端已有 `call_llm()`；
- 使用 Pillow 解码并验证实际图片格式与声明 MIME 一致，损坏文件返回 `400`；
- prompt 明确要求单个 JSON 对象，字段与小程序 `RawApiRecord` 一致；
- 去除可选 Markdown fence 后 `json.loads()`；校验顶层 object、`items` array、`sample_judgements` array 和必需字符串字段；
- 捕获模型连接/超时/无效 JSON，路由统一返回 `502`，日志仅记录 `user_id`、耗时、异常类型，不记录图片、Cookie、key 或模型完整响应；
- `.env.example` 增加 `MINIPROGRAM_INSPECTION_MAX_IMAGE_BYTES=614400` 和 `MINIPROGRAM_INSPECTION_TIMEOUT_SECONDS=120`。

路由签名：

```python
@router.post("/quality-inspections/recognize")
async def recognize_quality_inspection(request: Request, file: UploadFile = File(...)):
    user = require_session_user(request, "procurement")
    content = await file.read(MAX_IMAGE_BYTES + 1)
    result = recognize_inspection_image(content, file.content_type or "")
    return {"success": True, "data": result}
```

- [ ] **Step 4: 运行识别代理测试**

Run: `cd $HOME/smart_sales_system && SESSION_SECRET_KEY=test-only-secret DB_BACKEND=sqlite pytest tests/test_miniprogram_inspection_recognition.py -q`

Expected: PASS。

- [ ] **Step 5: 提交识别代理**

```bash
cd $HOME/smart_sales_system
git add services/miniprogram_inspection_recognition.py routes/miniprogram.py .env.example tests/test_miniprogram_inspection_recognition.py
git commit -m "feat: proxy miniprogram inspection recognition"
```

---

### Task 7: 后端全量回归与测试 MySQL 迁移门

**Files:**
- Modify only if a regression is exposed: files changed in Tasks 1-6
- Test: all backend tests

**Interfaces:**
- Consumes: Tasks 1-6 的完整后端契约。
- Produces: 经过 SQLite 全量测试和测试 MySQL 迁移验证的后端提交序列。

- [ ] **Step 1: 运行后端聚焦测试集合**

```bash
cd $HOME/smart_sales_system
SESSION_SECRET_KEY=test-only-secret DB_BACKEND=sqlite pytest \
  tests/test_secret_configuration.py \
  tests/test_session_auth.py \
  tests/test_miniprogram_auth_api.py \
  tests/test_quality_inspection_schema_migration.py \
  tests/test_quality_inspection_sources_api.py \
  tests/test_quality_inspection_standalone_api.py \
  tests/test_miniprogram_inspection_recognition.py -q
```

Expected: PASS。

- [ ] **Step 2: 运行 SQLite 全量测试**

Run: `cd $HOME/smart_sales_system && SESSION_SECRET_KEY=test-only-secret DB_BACKEND=sqlite pytest -q`

Expected: PASS；若失败，只修复由 Tasks 1-6 引入的回归，并重新运行失败文件与全量测试。

- [ ] **Step 3: 在专用测试 MySQL 上执行备份后迁移**

```bash
cd $HOME/smart_sales_system
DB_BACKEND=mysql SESSION_SECRET_KEY="$SESSION_SECRET_KEY" python scripts/maintenance/migrate_quality_inspection_sources.py
```

Expected: 输出 `quality_inspection_tasks migration verified`；运行前确认环境变量指向测试库而非生产库，且已生成测试库备份。随后再次执行同一命令，预期仍成功，证明幂等。

- [ ] **Step 4: 用只读 SQL 验证目标结构与历史数据**

验证结果必须满足：`source_type` 非空且旧行全为 `purchase_order`；`purchase_order_id`、`contract_no` 可空；`client_record_id` 有唯一索引；旧采购任务数量迁移前后相同。不得把 MySQL 连接串写入命令历史、测试文件或提交。

- [ ] **Step 5: 如有回归修复，单独提交**

```bash
cd $HOME/smart_sales_system
git diff --name-only -- services/session_auth.py routes/miniprogram.py services/miniprogram_inspection_recognition.py models.py database.py routes/customer_orders.py main.py routes/users.py services/llm_client.py .env.example tests | xargs git add --
git commit -m "fix: preserve quality inspection compatibility"
```

没有代码变化时跳过提交，不制造空提交。

---

### Task 8: 小程序统一 HTTPS/Cookie 请求客户端

**Files:**
- Create: `$HOME/WeChatProjects/miniprogram-2/miniprogram/config/server.ts`
- Create: `$HOME/WeChatProjects/miniprogram-2/miniprogram/services/server-client.ts`
- Test: `$HOME/WeChatProjects/miniprogram-2/tests/server-client.test.ts`

**Interfaces:**
- Consumes: `wx.request`、`wx.uploadFile`、`wx.getStorageSync`、`wx.setStorageSync`、`wx.removeStorageSync`。
- Produces: `serverRequest<T>(options, adapter?) -> Promise<T>`、`serverUpload<T>(options, adapter?) -> Promise<T>`、`clearSessionCookie(adapter?) -> void`、`ServerClientError`。

- [ ] **Step 1: 写 Cookie 与错误映射失败测试**

```typescript
// tests/server-client.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'

import { SERVER_BASE_URL, SESSION_COOKIE_STORAGE_KEY } from '../miniprogram/config/server'
import { clearSessionCookie, serverRequest, ServerClientAdapter } from '../miniprogram/services/server-client'

function harness() {
  const storage = new Map<string, unknown>()
  const requests: Array<Record<string, unknown>> = []
  const adapter: ServerClientAdapter = {
    getStorage: (key) => storage.get(key),
    setStorage: (key, value) => storage.set(key, value),
    removeStorage: (key) => storage.delete(key),
    request: async (options) => {
      requests.push(options)
      return { statusCode: 200, data: { success: true, data: { ok: true } }, cookies: ['session=signed-cookie; Path=/; HttpOnly'] }
    },
    uploadFile: async () => ({ statusCode: 200, data: JSON.stringify({ success: true, data: {} }), cookies: [] }),
  }
  return { adapter, storage, requests }
}

test('serverRequest saves response cookie and carries it on the next request', async () => {
  const state = harness()
  await serverRequest<{ ok: boolean }>({ method: 'POST', path: '/api/miniprogram/auth/login', data: {} }, state.adapter)
  await serverRequest<{ ok: boolean }>({ method: 'GET', path: '/api/miniprogram/auth/me' }, state.adapter)
  assert.equal(state.storage.get(SESSION_COOKIE_STORAGE_KEY), 'session=signed-cookie')
  assert.equal((state.requests[1].header as Record<string, string>).Cookie, 'session=signed-cookie')
  assert.equal(SERVER_BASE_URL, 'https://example.invalid')
})

test('401 clears cookie and throws a user-readable error', async () => {
  const state = harness()
  state.storage.set(SESSION_COOKIE_STORAGE_KEY, 'session=expired')
  state.adapter.request = async () => ({ statusCode: 401, data: { success: false, error: '未登录' }, cookies: [] })
  await assert.rejects(() => serverRequest({ method: 'GET', path: '/api/miniprogram/auth/me' }, state.adapter), /未登录/)
  assert.equal(state.storage.has(SESSION_COOKIE_STORAGE_KEY), false)
  clearSessionCookie(state.adapter)
})
```

- [ ] **Step 2: 运行测试确认模块不存在**

Run: `cd $HOME/WeChatProjects/miniprogram-2 && npx tsx --test --test-name-pattern='serverRequest' tests/*.test.ts`

Expected: FAIL with module resolution error。

- [ ] **Step 3: 实现配置和可注入 adapter**

```typescript
// miniprogram/config/server.ts
export const SERVER_BASE_URL = 'https://example.invalid'
export const SERVER_REQUEST_TIMEOUT_MS = 30_000
export const SERVER_UPLOAD_TIMEOUT_MS = 120_000
export const SESSION_COOKIE_STORAGE_KEY = 'smartSalesSession:v1'
```

`server-client.ts` 固定行为：

- `ServerClientAdapter` 的 `request` 与 `uploadFile` 返回 `{statusCode, data, cookies}`；默认 adapter 包装微信 callback API；
- 只保存 cookies 中以 `session=` 开头的 `name=value`，丢弃属性；
- JSON 请求默认 `Content-Type: application/json`；有 Cookie 时加 `Cookie`；
- 上传解析字符串 JSON；
- `2xx && success === true` 返回 `data`；
- `401` 清 Cookie；`400/403/404/409/413/422/429/502` 依次读取后端 `error`、`detail`，两者都没有时使用通用提示；其余状态显示 `服务器暂时不可用`；
- 网络 fail 映射 `网络连接失败，请稍后重试`，超时映射 `请求超时，请重试`；
- 不打印 request data、Cookie、密码或原始响应。

核心返回解析签名：

```typescript
export interface ServerRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  data?: unknown
  timeoutMs?: number
}

export interface ServerUploadOptions {
  path: string
  filePath: string
  name: string
  formData?: Record<string, string>
  timeoutMs?: number
}

export interface ApiEnvelope<T> {
  success: boolean
  data?: T
  error?: string
  detail?: string
}

export class ServerClientError extends Error {
  constructor(message: string, readonly statusCode = 0) {
    super(message)
  }
}
```

- [ ] **Step 4: 运行客户端测试和类型检查**

Run: `cd $HOME/WeChatProjects/miniprogram-2 && npm test && npm run typecheck`

Expected: PASS。

- [ ] **Step 5: 提交统一请求层**

```bash
cd $HOME/WeChatProjects/miniprogram-2
git add miniprogram/config/server.ts miniprogram/services/server-client.ts tests/server-client.test.ts
git commit -m "feat: add secure miniprogram server client"
```

---

### Task 9: 小程序登录页与会话恢复

**Files:**
- Create: `$HOME/WeChatProjects/miniprogram-2/miniprogram/services/auth-service.ts`
- Create: `$HOME/WeChatProjects/miniprogram-2/miniprogram/pages/login/login.ts`
- Create: `$HOME/WeChatProjects/miniprogram-2/miniprogram/pages/login/login.wxml`
- Create: `$HOME/WeChatProjects/miniprogram-2/miniprogram/pages/login/login.scss`
- Create: `$HOME/WeChatProjects/miniprogram-2/miniprogram/pages/login/login.json`
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/app.json`
- Test: `$HOME/WeChatProjects/miniprogram-2/tests/auth-service.test.ts`

**Interfaces:**
- Consumes: Task 8 的 `serverRequest()` 和 `clearSessionCookie()`。
- Produces: `login(username, password, adapter?) -> Promise<AuthUser>`、`getCurrentUser(adapter?) -> Promise<AuthUser>`、`logout(adapter?) -> Promise<void>`。

- [ ] **Step 1: 写 auth service 失败测试**

```typescript
// tests/auth-service.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'

import { login, logout } from '../miniprogram/services/auth-service'

const user = { id: 7, username: 'inspector', real_name: '检验员', role: 'sales', permissions: ['procurement'], avatar_url: '' }

test('login posts JSON credentials and returns the current user', async () => {
  const calls: Array<Record<string, unknown>> = []
  const request = async (options: Record<string, unknown>) => {
    calls.push(options)
    return { user }
  }
  assert.deepEqual(await login('inspector', 'secret', request), user)
  assert.deepEqual(calls[0], { method: 'POST', path: '/api/miniprogram/auth/login', data: { username: 'inspector', password: 'secret' } })
})

test('logout clears local session even when the network request fails', async () => {
  let cleared = false
  await assert.rejects(() => logout(async () => { throw new Error('offline') }, () => { cleared = true }), /offline/)
  assert.equal(cleared, true)
})
```

测试注入类型固定为 `export type AuthRequest = <T>(options: ServerRequestOptions) => Promise<T>`，其中 `ServerRequestOptions` 来自 Task 8；不依赖全局 `wx`。

- [ ] **Step 2: 运行测试确认服务不存在**

Run: `cd $HOME/WeChatProjects/miniprogram-2 && npx tsx --test --test-name-pattern='login' tests/*.test.ts`

Expected: FAIL with module resolution error。

- [ ] **Step 3: 实现 auth service 和登录页**

```typescript
export interface AuthUser {
  id: number
  username: string
  real_name: string
  role: string
  permissions: string[]
  avatar_url: string
}

export async function login(username: string, password: string, request: AuthRequest = serverRequest): Promise<AuthUser> {
  const data = await request<{ user: AuthUser }>({ method: 'POST', path: '/api/miniprogram/auth/login', data: { username: username.trim(), password } })
  return data.user
}
```

登录页行为：

- data 只有 `username`、`password`、`submitting`、`errorMessage`；
- `onLoad()` 调 `getCurrentUser()`，成功 `wx.reLaunch({url: '/pages/index/index'})`，401 留在登录页；
- 提交前检查非空；按钮 loading 防重复；失败只显示服务端用户可读消息；
- 成功后清空页面内 password 并 reLaunch 首页；
- 页面不得调用 storage 保存用户名或密码；
- `app.json` pages 顺序为 login、index、logs。

- [ ] **Step 4: 运行测试与类型检查**

Run: `cd $HOME/WeChatProjects/miniprogram-2 && npm test && npm run typecheck`

Expected: PASS。

- [ ] **Step 5: 提交登录功能**

```bash
cd $HOME/WeChatProjects/miniprogram-2
git add miniprogram/services/auth-service.ts miniprogram/pages/login miniprogram/app.json tests/auth-service.test.ts
git commit -m "feat: add miniprogram account login"
```

---

### Task 10: 本地历史 v2、稳定 UUID 和同步状态机

**Files:**
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/domain/inspection-history.ts`
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/services/history-service.ts`
- Test: `$HOME/WeChatProjects/miniprogram-2/tests/inspection-history.test.ts`
- Test: `$HOME/WeChatProjects/miniprogram-2/tests/history-service.test.ts`

**Interfaces:**
- Consumes: 现有 `InspectionRecord` 和文件保存 adapter。
- Produces: `StoredInspectionRecordV2`、`SyncStatus`、`markHistorySyncing()`、`markHistorySynced()`、`markHistoryFailed()`；storage key `inspectionHistory:v2`，兼容读取 `inspectionHistory:v1`。

- [ ] **Step 1: 扩展领域测试覆盖 v1 迁移与四态转换**

```typescript
const legacy = {
  id: 'IR-100', imagePath: '/saved/100.jpg', rawContent: '{}', record: createRecord(), createdAt: 100, updatedAt: 100, syncStatus: 'local',
}

test('parseHistory migrates v1 records to stable client ids', () => {
  const records = parseHistory([legacy], () => '550e8400-e29b-41d4-a716-446655440000')
  assert.equal(records[0].clientRecordId, '550e8400-e29b-41d4-a716-446655440000')
  assert.equal(records[0].sourceType, 'standalone')
  assert.equal(records[0].syncStatus, 'local')
  assert.equal(records[0].taskId, null)
  assert.equal(records[0].itemId, null)
})

test('sync transitions preserve local report data', () => {
  const local = createStoredRecord(100)
  const syncing = updateSyncState(local, { syncStatus: 'syncing', syncError: '' }, 200)
  const failed = updateSyncState(syncing, { syncStatus: 'failed', syncError: '网络连接失败' }, 300)
  const synced = updateSyncState(failed, { syncStatus: 'synced', syncError: '', taskId: 8, itemId: 9 }, 400)
  assert.equal(failed.imagePath, local.imagePath)
  assert.equal(failed.record.customer, local.record.customer)
  assert.deepEqual({ status: synced.syncStatus, task: synced.taskId, item: synced.itemId }, { status: 'synced', task: 8, item: 9 })
})
```

- [ ] **Step 2: 运行历史测试确认旧类型不支持**

Run: `cd $HOME/WeChatProjects/miniprogram-2 && npx tsx --test --test-name-pattern='migrates v1|sync transitions' tests/*.test.ts`

Expected: FAIL；旧接口只接受 `syncStatus: 'local'`。

- [ ] **Step 3: 实现 v2 类型和纯状态转换**

```typescript
export const HISTORY_STORAGE_KEY = 'inspectionHistory:v2'
export const LEGACY_HISTORY_STORAGE_KEY = 'inspectionHistory:v1'
export type SyncStatus = 'local' | 'syncing' | 'synced' | 'failed'
export type InspectionSourceType = 'purchase_order' | 'standalone'

export interface StoredInspectionRecord {
  id: string
  clientRecordId: string
  sourceType: InspectionSourceType
  taskId: number | null
  itemId: number | null
  imagePath: string
  rawContent: string
  record: InspectionRecord
  createdAt: number
  updatedAt: number
  syncStatus: SyncStatus
  syncError: string
}
```

具体规则：

- 新记录由 adapter 注入 `createUuid()`；默认实现使用 `wx.getRandomValues` 生成 RFC 4122 v4，不使用时间戳作为幂等编号；
- v1 读取后立即写 v2，保留旧 key 一次回滚周期但后续只写 v2；
- 旧记录默认 `sourceType=standalone`、服务端 id 为 null；
- `syncing` 应用启动时恢复为 `failed`，错误为 `上次同步未完成，请重试`；
- `markHistorySynced()` 必须同时写入 `taskId`、`itemId`；
- 删除或裁剪记录时继续清理对应本地图片。

- [ ] **Step 4: 扩展 history service adapter 测试并实现双 key 迁移**

`HistoryStorageAdapter` 增加：

```typescript
getStorage(key: string): unknown
setStorage(key: string, records: StoredInspectionRecord[]): void
removeStorage(key: string): void
createUuid(): string
```

测试断言：读到 v1 后 v2 被写入；同步失败更新只改状态字段；删除失败同步记录仍清理图片；`saveInspectionHistory()` 更新已有记录时不改变 `clientRecordId`。

- [ ] **Step 5: 运行历史全套测试和类型检查**

Run: `cd $HOME/WeChatProjects/miniprogram-2 && npm test && npm run typecheck`

Expected: PASS。

- [ ] **Step 6: 提交本地同步状态机**

```bash
cd $HOME/WeChatProjects/miniprogram-2
git add miniprogram/domain/inspection-history.ts miniprogram/services/history-service.ts tests/inspection-history.test.ts tests/history-service.test.ts
git commit -m "feat: add durable inspection sync state"
```

---

### Task 11: 质检 DTO、双向草稿映射和后端识别调用

**Files:**
- Create: `$HOME/WeChatProjects/miniprogram-2/miniprogram/services/quality-inspection-service.ts`
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/services/inspection-service.ts:1-280`
- Test: `$HOME/WeChatProjects/miniprogram-2/tests/quality-inspection-service.test.ts`
- Test: `$HOME/WeChatProjects/miniprogram-2/tests/inspection-service.test.ts`

**Interfaces:**
- Consumes: Task 8 client、Task 10 `StoredInspectionRecord`、现有 `RawApiRecord`/`InspectionRecord`。
- Produces: `QualityInspectionTaskDto`、`createStandaloneInspection()`、`saveInspectionDraft()`、`recognizeInspectionFile()`、`inspectionRecordToDraft()`、`draftToInspectionRecord()`。

- [ ] **Step 1: 写映射与 API 路径失败测试**

```typescript
// tests/quality-inspection-service.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'

import { inspectionRecordToDraft, createStandaloneInspection } from '../miniprogram/services/quality-inspection-service'


test('inspectionRecordToDraft preserves ten-column rows and miniprogram metadata', () => {
  const record = createCompleteRecord()
  const draft = inspectionRecordToDraft(record)
  assert.equal(draft.inspection_records[0].row_key, record.rows[0].id)
  assert.equal(draft.inspection_records[0].project, record.rows[0].item)
  assert.deepEqual(draft.inspection_records[0].sample_data, record.rows[0].measurements)
  assert.deepEqual(draft.inspection_records[0].measurement_standards, { '规格': record.rows[0].specification })
  assert.equal(draft.ai_workbench_result.schema_version, 'miniprogram-inspection/v1')
  assert.deepEqual(draft.ai_workbench_result.sample_judgements, record.sampleJudgements)
})

test('createStandaloneInspection sends stable client id to the standalone endpoint', async () => {
  const calls: Array<Record<string, unknown>> = []
  const request = async (options: Record<string, unknown>) => {
    calls.push(options)
    return { task_id: 10, item_id: 11, task: { id: 10, items: [{ id: 11 }] } }
  }
  await createStandaloneInspection('550e8400-e29b-41d4-a716-446655440000', createCompleteRecord(), request)
  assert.equal(calls[0].path, '/customer-orders/api/quality-inspections/standalone')
  assert.equal((calls[0].data as Record<string, unknown>).client_record_id, '550e8400-e29b-41d4-a716-446655440000')
})
```

扩展 `inspection-service.test.ts`：注入 upload 函数，断言路径为 `/api/miniprogram/quality-inspections/recognize`，并静态断言 `inspection-service.ts` 不含 `8865`、`TOKEN_STORAGE_KEY` 或 `Authorization`。

- [ ] **Step 2: 运行测试确认服务不存在或旧直连逻辑仍在**

Run: `cd $HOME/WeChatProjects/miniprogram-2 && npx tsx --test --test-name-pattern='preserves ten-column|stable client id|recognizeInspection' tests/*.test.ts`

Expected: FAIL。

- [ ] **Step 3: 定义后端 DTO 和精确映射**

```typescript
export interface QualityInspectionDraftPayload {
  inspection_records: Array<{
    row_key: string
    group_title: string
    project: string
    method: string
    standard: string
    decision: string
    sample_data: string[]
    measurement_standards: Record<string, string>
    note: string
    ai_result: Record<string, unknown>
    images: string[]
  }>
  ai_workbench_result: Record<string, unknown>
  ai_workbench_images: string[]
}
```

映射固定为：

- row `id → row_key`、`productType → group_title`、`item → project`、`requirement → standard`、`specification → measurement_standards['规格']`、`measurements → sample_data`；
- decision 使用对应行样本中出现 NG 则 `NG`，全部 OK 则 `OK`，否则空字符串；
- `ai_workbench_result` 使用设计规范第 10 节的全部字段和 `schema_version=miniprogram-inspection/v1`；
- 本地图片通过文件系统读取并转 data URL 后放入 `ai_workbench_images`，只允许单张且沿用 `600 KB` 限制；
- 反向映射优先读取 `ai_workbench_result`，缺字段时使用 task/item DTO 兜底，确保 Web 保存的采购草稿也能打开。

- [ ] **Step 4: 实现 API 方法并删除小程序直连大模型**

固定 API：

```typescript
export const listInspectionTasks = (query: TaskQuery, request = serverRequest) => request<TaskListData>({ method: 'GET', path: `/customer-orders/api/purchase-orders/quality-inspections?${encodeTaskQuery(query)}` })
export const getInspectionTask = (taskId: number, request = serverRequest) => request<QualityInspectionTaskDto>({ method: 'GET', path: `/customer-orders/api/purchase-orders/quality-inspections/${taskId}` })
export const saveInspectionDraft = (taskId: number, itemId: number, payload: QualityInspectionDraftPayload, request = serverRequest) => request({ method: 'POST', path: `/customer-orders/api/purchase-orders/quality-inspections/${taskId}/items/${itemId}/draft`, data: payload })
```

`recognizeInspection()` 只负责 `prepareImageForUpload()` 后调用 `recognizeInspectionFile()`；删除 8865 URL、模型 token storage、Authorization header 和 `wx.request<ChatCompletionResponse>`。

- [ ] **Step 5: 运行映射、识别和现有领域测试**

Run: `cd $HOME/WeChatProjects/miniprogram-2 && npm test && npm run typecheck`

Expected: PASS。

- [ ] **Step 6: 提交质检服务和识别迁移**

```bash
cd $HOME/WeChatProjects/miniprogram-2
git add miniprogram/services/quality-inspection-service.ts miniprogram/services/inspection-service.ts tests/quality-inspection-service.test.ts tests/inspection-service.test.ts
git commit -m "feat: connect inspections to shared backend"
```

---

### Task 12: 三栏目工作区和采购待检任务

**Files:**
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/pages/index/index.ts`
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/pages/index/index.wxml`
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/pages/index/index.scss`
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/pages/index/index.json`
- Test: `$HOME/WeChatProjects/miniprogram-2/tests/quality-inspection-service.test.ts`

**Interfaces:**
- Consumes: `getCurrentUser()`、`listInspectionTasks()`、`getInspectionTask()`、`draftToInspectionRecord()`、现有拍照/编辑流程。
- Produces: `WorkspaceTab = 'scan' | 'tasks' | 'history'`；任务分页、搜索、状态过滤、任务明细选择和预填。

- [ ] **Step 1: 添加任务查询纯函数测试**

```typescript
test('encodeTaskQuery always requests purchase-order tasks for the pending tab', () => {
  assert.equal(
    encodeTaskQuery({ page: 2, pageSize: 20, search: 'PO-1', status: 'pending', sourceType: 'purchase_order' }),
    'page=2&page_size=20&search=PO-1&status=pending&source_type=purchase_order',
  )
})

test('task item prefill keeps supplier and product values', () => {
  const record = taskItemToInspectionRecord(mockTask, mockTask.items[0])
  assert.equal(record.customer, mockTask.customer_name)
  assert.equal(record.supplier, mockTask.supplier_name)
  assert.equal(record.model, mockTask.items[0].spec_desc)
  assert.equal(record.arrivalQuantity, String(mockTask.items[0].quantity))
})
```

- [ ] **Step 2: 运行测试确认函数不存在**

Run: `cd $HOME/WeChatProjects/miniprogram-2 && npx tsx --test --test-name-pattern='purchase-order tasks|task item prefill' tests/*.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现任务 DTO 适配和页面状态**

`index.ts` 增加且仅增加下列状态：

```typescript
activeTab: 'scan' as WorkspaceTab,
taskItems: [] as QualityInspectionTaskDto[],
taskPage: 1,
taskTotal: 0,
taskSearch: '',
taskStatus: 'pending',
taskLoading: false,
selectedTaskId: 0,
selectedItemId: 0,
```

行为：

- `onLoad()` 先 `getCurrentUser()`；401 reLaunch 登录页；
- 切换到 tasks 调 `loadTasks(true)`；触底分页；搜索输入经用户点击确认后重置页码；状态 picker 支持 pending/completed/all；
- 任务请求永远显式 `source_type=purchase_order`；
- 打开任务后展示其明细；选择明细将 `selectedTaskId/itemId` 写入页面并以服务端产品数据预填编辑记录，然后进入现有拍照识别流程；
- 不在列表页下载 PDF 或加载大图片；
- 底部 tab 扩为三项，indicator CSS 按 0/1/2 三个位置移动；WXML 为任务加载、空态、错误和分页尾部提供明确状态。

- [ ] **Step 4: 运行测试、类型检查和开发者工具编译**

Run: `cd $HOME/WeChatProjects/miniprogram-2 && npm test && npm run typecheck`

Expected: PASS；随后在微信开发者工具编译，预期 WXML/SCSS 无错误，三个 tab 均可切换，未登录会进入登录页。

- [ ] **Step 5: 提交三栏目和待检任务**

```bash
cd $HOME/WeChatProjects/miniprogram-2
git add miniprogram/pages/index tests/quality-inspection-service.test.ts
git commit -m "feat: add pending inspection workspace"
```

---

### Task 13: 独立报告同步、采购草稿覆盖和失败重试

**Files:**
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/pages/index/index.ts`
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/pages/index/index.wxml`
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/pages/index/index.scss`
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/services/quality-inspection-service.ts`
- Test: `$HOME/WeChatProjects/miniprogram-2/tests/quality-inspection-service.test.ts`
- Test: `$HOME/WeChatProjects/miniprogram-2/tests/history-service.test.ts`

**Interfaces:**
- Consumes: `createStandaloneInspection()`、`saveInspectionDraft()`、Task 10 状态更新函数。
- Produces: `syncStoredInspection(record, deps) -> Promise<StoredInspectionRecord>`；独立/采购两条同步路径；历史重试按钮。

- [ ] **Step 1: 写独立同步和采购覆盖失败测试**

```typescript
test('standalone sync creates once, saves draft, then marks local record synced', async () => {
  const calls: string[] = []
  const result = await syncStoredInspection(createLocalStandalone(), {
    createStandalone: async () => { calls.push('create'); return { task_id: 20, item_id: 21 } },
    saveDraft: async () => { calls.push('draft') },
    updateState: async (record) => record,
    imageToDataUrl: async () => 'data:image/jpeg;base64,YQ==',
  })
  assert.deepEqual(calls, ['create', 'draft'])
  assert.equal(result.syncStatus, 'synced')
  assert.equal(result.taskId, 20)
  assert.equal(result.itemId, 21)
})

test('failed sync retains ids, image and record for retry', async () => {
  const local = createLocalStandalone()
  const result = await syncStoredInspection(local, {
    createStandalone: async () => { throw new Error('网络连接失败') },
    saveDraft: async () => undefined,
    updateState: async (record) => record,
    imageToDataUrl: async () => 'data:image/jpeg;base64,YQ==',
  })
  assert.equal(result.syncStatus, 'failed')
  assert.equal(result.clientRecordId, local.clientRecordId)
  assert.equal(result.imagePath, local.imagePath)
  assert.deepEqual(result.record, local.record)
})

test('purchase-order sync skips task creation and overwrites selected item draft', async () => {
  const calls: string[] = []
  await syncStoredInspection(createPurchaseRecord(30, 31), {
    createStandalone: async () => { calls.push('create'); return { task_id: 0, item_id: 0 } },
    saveDraft: async (taskId, itemId) => { calls.push(`draft:${taskId}:${itemId}`) },
    updateState: async (record) => record,
    imageToDataUrl: async () => 'data:image/jpeg;base64,YQ==',
  })
  assert.deepEqual(calls, ['draft:30:31'])
})
```

- [ ] **Step 2: 运行测试确认同步编排函数不存在**

Run: `cd $HOME/WeChatProjects/miniprogram-2 && npx tsx --test --test-name-pattern='standalone sync|failed sync|purchase-order sync' tests/*.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现先本地后服务端的同步编排**

`submitRecord()` 固定顺序：

1. 校验可编辑记录；
2. `saveInspectionHistory()` 保存图片、rawContent、record 和来源信息，获得稳定 `clientRecordId`；
3. 将本地状态写为 `syncing`；
4. standalone 调创建接口获得 task/item；purchase_order 直接使用已选 task/item；
5. 将图片转 data URL，构造 draft，调用现有草稿接口；
6. 成功写 `synced` 与服务端 ids；
7. 网络或业务失败写 `failed` 和用户可读 `syncError`，页面仍进入本地保存成功态并显示“已本地保存，可在历史记录重试”。

`syncStoredInspection()` 内部捕获错误并返回 failed 记录，不抛出导致本地数据丢失；401 例外仍保存 failed 后跳转登录页。重复点击重试复用同一 `clientRecordId`。

- [ ] **Step 4: 在历史卡片增加状态和重试动作**

WXML/SCSS 要求：

- local 显示“仅本地”；syncing 显示 loading；synced 显示“已同步”；failed 显示错误摘要和“重试同步”；
- 重试期间禁用同记录按钮；
- synced 记录允许继续编辑并覆盖同一个服务端 item 草稿，不创建新 task；
- 删除只删除本地副本，不自动删除服务器记录，确认文案必须明确这一点。

- [ ] **Step 5: 运行同步测试、全量测试和类型检查**

Run: `cd $HOME/WeChatProjects/miniprogram-2 && npm test && npm run typecheck`

Expected: PASS。

- [ ] **Step 6: 提交同步闭环**

```bash
cd $HOME/WeChatProjects/miniprogram-2
git add miniprogram/pages/index miniprogram/services/quality-inspection-service.ts tests/quality-inspection-service.test.ts tests/history-service.test.ts
git commit -m "feat: sync inspection drafts with retry"
```

---

### Task 14: 合并服务端历史与本地未同步记录

**Files:**
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/services/quality-inspection-service.ts`
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/pages/index/index.ts`
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/pages/index/index.wxml`
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/pages/index/index.scss`
- Test: `$HOME/WeChatProjects/miniprogram-2/tests/quality-inspection-service.test.ts`

**Interfaces:**
- Consumes: 服务端历史接口、`loadInspectionHistory()`。
- Produces: `HistoryViewItem` 和 `mergeInspectionHistory(local, remote) -> HistoryViewItem[]`；服务端请求显式 `source_type=all`。

- [ ] **Step 1: 写去重与排序失败测试**

```typescript
test('merged history deduplicates synced local records by task and item', () => {
  const merged = mergeInspectionHistory(
    [createSyncedLocal({ taskId: 10, itemId: 11, updatedAt: 100 })],
    [createRemoteHistory({ task_id: 10, item_id: 11, updated_at: '2026-07-22T12:00:00' })],
  )
  assert.equal(merged.length, 1)
  assert.equal(merged[0].origin, 'remote')
})

test('merged history keeps failed local records and sorts newest first', () => {
  const merged = mergeInspectionHistory(
    [createFailedLocal({ updatedAt: Date.parse('2026-07-22T13:00:00Z') })],
    [createRemoteHistory({ task_id: 20, item_id: 21, updated_at: '2026-07-22T12:00:00Z' })],
  )
  assert.equal(merged[0].origin, 'local')
  assert.equal(merged[0].syncStatus, 'failed')
})
```

- [ ] **Step 2: 运行测试确认合并函数不存在**

Run: `cd $HOME/WeChatProjects/miniprogram-2 && npx tsx --test --test-name-pattern='merged history' tests/*.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现服务端历史请求和确定性合并**

固定请求：

```typescript
serverRequest<HistoryListData>({
  method: 'GET',
  path: `/customer-orders/api/purchase-orders/quality-inspections/history-records?page=${page}&page_size=${pageSize}&source_type=all`,
})
```

合并规则：

- remote key 为 `task_id:item_id`；已 synced 的 local 若 key 相同，只展示 remote；
- local/failed/syncing 始终保留；
- remote 显示 `source_type` 标签“采购质检”或“独立报告”；
- 统一按 updated timestamp 降序；相同时间 remote 排在 local 后，保持稳定 id 排序；
- remote 点击通过详情/草稿反向映射打开编辑；local 点击沿用本地编辑；
- 服务端加载失败时仍展示 local，并显示非阻塞错误条，不清空本地数据。

- [ ] **Step 4: 运行历史合并测试与全量验证**

Run: `cd $HOME/WeChatProjects/miniprogram-2 && npm test && npm run typecheck`

Expected: PASS。

- [ ] **Step 5: 提交合并历史**

```bash
cd $HOME/WeChatProjects/miniprogram-2
git add miniprogram/services/quality-inspection-service.ts miniprogram/pages/index tests/quality-inspection-service.test.ts
git commit -m "feat: merge local and server inspection history"
```

---

### Task 15: 两仓库契约回归、开发者工具与真机闭环

**Files:**
- Modify only when verification exposes a feature regression: files from Tasks 1-14
- Test: both repositories and deployed test environment

**Interfaces:**
- Consumes: 全部后端与小程序契约。
- Produces: 可部署、可回滚、通过自动化与手工验收的两仓库提交序列。

- [ ] **Step 1: 再次确认两个仓库没有混入用户修改**

```bash
git -C $HOME/smart_sales_system status --short --branch
git -C $HOME/WeChatProjects/miniprogram-2 status --short --branch
git -C $HOME/smart_sales_system diff --check
git -C $HOME/WeChatProjects/miniprogram-2 diff --check
```

Expected: 只存在计划内提交，工作区干净，`diff --check` 无输出。

- [ ] **Step 2: 运行后端全量测试**

Run: `cd $HOME/smart_sales_system && SESSION_SECRET_KEY=test-only-secret DB_BACKEND=sqlite pytest -q`

Expected: PASS。

- [ ] **Step 3: 运行小程序全量测试和类型检查**

Run: `cd $HOME/WeChatProjects/miniprogram-2 && npm test && npm run typecheck`

Expected: PASS。

- [ ] **Step 4: 检查小程序构建产物不含敏感地址或凭据**

```bash
cd $HOME/WeChatProjects/miniprogram-2
rg -n "MYSQL_|192\.168\.1\.37|:3306|:8865|Authorization|MOONSHOT_API_KEY|CLOUD_LLM_API_KEY" miniprogram
```

Expected: 无输出。`https://example.invalid` 只能在 `miniprogram/config/server.ts` 出现一次。

- [ ] **Step 5: 配置微信合法域名并在开发者工具联调**

在微信公众平台将 `https://example.invalid` 同时加入 request 与 uploadFile 合法域名；开发者工具关闭“不校验合法域名”后验证：登录、me、采购任务分页/搜索、图片识别、采购草稿保存、独立报告创建、断网失败状态、恢复网络重试、合并历史均成功。

- [ ] **Step 6: 测试环境验证 Web 共用数据**

使用专用测试账号和专用测试记录：

1. 小程序创建独立报告并记下 task/item；
2. Web 质检工作台用 `source_type=all` 或相应页面确认可见；
3. Web 打开草稿，确认十列数据、元数据和图片恢复；
4. Web 生成 PDF，确保 nullable 采购字段不导致异常；
5. 小程序打开同一记录并覆盖草稿；
6. 使用同一 `client_record_id` 重试，确认数据库仍只有一个任务。

- [ ] **Step 7: 真机 HTTPS 验收**

在真机完成：账号登录 → 读取采购任务 → 拍照识别 → 校对 → 保存采购草稿；再完成独立扫描 → 本地保存 → 服务端同步 → 历史查看。抓包或服务端 access log 必须显示请求只发往 `7876`，Cookie 仅经 HTTPS 发送。

- [ ] **Step 8: 生产发布前备份、迁移与冒烟**

先备份生产 MySQL，再设置生产 `SESSION_SECRET_KEY` 与模型环境变量，执行迁移脚本两次确认幂等，然后部署后端，最后上传小程序。冒烟只使用专用测试记录；任何失败先回滚应用版本并使用备份恢复，不在生产库手工改列绕过迁移脚本。

- [ ] **Step 9: 如验证产生修复，分别提交并重新跑全量测试**

```bash
cd $HOME/smart_sales_system
git diff --name-only -- services routes models.py database.py main.py .env.example tests scripts/maintenance | xargs git add --
git commit -m "fix: complete shared inspection verification"

cd $HOME/WeChatProjects/miniprogram-2
git diff --name-only -- miniprogram tests | xargs git add --
git commit -m "fix: complete miniprogram inspection verification"
```

没有对应仓库代码变化时跳过该仓库提交。完成后重复 Steps 1-7，直到全部通过。
