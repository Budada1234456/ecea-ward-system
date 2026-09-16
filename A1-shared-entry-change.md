# A-1 Shared Entry Change

本次 A-1 富文本编辑器拆分需要将现有编辑器从 `src/main.jsx` 接入 `src/editor/`，因此会触及 C 管理的共享入口文件。

## 越界文件

- `src/main.jsx`

## 原因

- 移除共享入口中的重复编辑器实现。
- 从 `src/editor/` 引入编辑器、内容规范化和预览清洗函数。
- 让保存、重载、预览和 PDF 导出继续使用同一份规范化 HTML。

## 影响范围

- 仅替换富文本编辑器组件和相关纯文本/HTML辅助函数的归属。
- 不修改 B 的表单目录、PDF 识别路由或接口协议；依赖变更仅见下方表格扩展说明。
- 现有字段键、保存接口和图片上传接口保持不变。
- 粘贴、编辑更新、重载和预览均复用 `sanitizeRichText`；编辑器通过 `transformPastedHTML` 在粘贴进入文档前执行清洗。

## 后续编辑器增强说明

- 表格编辑增强仍属于 `src/editor/` 范围。
- 为实现可编辑表格的插入/删除行列、合并/拆分单元格和列宽调整，已在 `package.json`、`package-lock.json` 增加 `@tiptap/extension-table@^3.31.3`；该依赖仅由 `src/editor/` 使用。
- 编辑器增强包含文字色、背景色、中文字号（初号至小六）、扩展字体族、1–4 级大纲、局部预览、表格边框/背景色以及表格插入、行列增删、合并/拆分和删除。

## C 接入事项

- C 合并时需保留 `src/main.jsx` 对 `src/editor/` 导出的引用。
- C 可继续复用 `sanitizeRichText` 渲染预览和导出内容。

## A-2 Word 导入共享入口变更

### 越界文件

- `src/main.jsx`
- `server.mjs`
- `package.json`
- `package-lock.json`

### 原因

- 在申报编辑页右上角增加 `.docx` 导入按钮，并挂载 `src/import/WordImportDialog.jsx`。
- 在 Express 应用中挂载 `routes/word-import.mjs` 提供的 Word 解析路由。
- 增加 DOCX ZIP 校验、正文解析、结构化 HTML 遍历和服务端白名单清洗所需的 `jszip`、`mammoth`、`htmlparser2`、`sanitize-html` 依赖。

### 影响范围

- `src/main.jsx` 只增加 Word 对话框 import、显示状态、按钮和确认后字段合并，不改 PDF `ImportDialog` 及其接口。
- `server.mjs` 只注入认证、项目所有权校验和 Word 路由，不改现有 PDF 上传、分片、识别或文件持久化流程。
- Word 解析结果只返回候选字段；只有用户在前端确认后才调用既有 `setData` 更新草稿。
- Word 原文件不持久化，路由结束后清理 Multer 临时文件。

### C 接入事项

- C 合并时保留 `src/main.jsx` 对 `src/import/WordImportDialog.jsx` 的引用、`showWordImport` 状态和右上角入口。
- C 合并 `server.mjs` 时保留 `/api/word-import` 路由挂载，并确保它位于通用认证中间件之后。
- C 统一核对并保留 `jszip`、`mammoth`、`htmlparser2`、`sanitize-html` 依赖及锁文件变更。
- C 回归时同时验证 PDF 智能导入入口和路由行为未改变。
- Word 候选应用现在由 `src/main.jsx` 先持久化合并后的快照，保存成功后才更新 React 草稿状态；保存失败时不得改变前端原草稿。

## A-6 富文本服务端保存校验

### 越界文件

- `server.mjs`

### 原因

- 在申报数据写入 `data_json` 前，对已知富文本字段执行与编辑器粘贴、Word 导入相同的标签、属性、CSS 属性和 URL 协议白名单校验。
- 服务端保存是阻止绕过浏览器清洗直接提交危险 HTML 的最终校验点，因此必须接入共享保存入口。

### 影响范围

- 仅在 `PUT /api/applications/:id` 合并请求数据后、写入数据库前调用 `sanitizeApplicationRichTextData`。
- 只清洗顶层富文本字段以及 `people[].contribution`、`units[].contribution`；普通文本和其他结构化字段保持原值。
- 不修改任何 PDF 上传、识别、导入、文件持久化路由或行为。

### C 接入事项

- C 合并 `server.mjs` 时需保留 `sanitizeApplicationRichTextData` 的导入及保存前调用，避免客户端校验被绕过。
- 统一白名单定义位于 `src/editor/rich-text-policy.mjs`，Node 清洗适配位于 `src/editor/rich-text-node.mjs`。
