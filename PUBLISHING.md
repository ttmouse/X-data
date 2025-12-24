# 发布 X Data Scraper 到 Google Chrome Web Store 指南

本指南将帮助你将 X Data Scraper 扩展程序发布到 Google Chrome Web Store，让更多用户能够使用你的工具。

## 前期准备工作

### 1. Google 开发者账户

1. 访问 [Chrome Web Store 开发者仪表板](https://chrome.google.com/webstore/developer/dashboard)
2. 使用你的 Google 账户登录
3. 支付一次性注册费用（目前为 5 美元）
4. 完成开发者资料和付款信息设置

### 2. 扩展程序准备

#### 2.1 测试扩展程序

确保你的扩展程序在各种情况下都能正常工作：
- 在不同版本的 Chrome 浏览器上测试
- 测试所有功能：数据抓取、自动滚动、侧边栏等
- 检查是否有控制台错误
- 验证扩展程序不会影响网页性能

#### 2.2 完善 manifest.json

确保 `manifest.json` 包含所有必需字段：
```json
{
    "manifest_version": 3,
    "name": "X Data Scraper",
    "version": "1.0.0",
    "description": "Scrape tweets and media links from X/Twitter account analytics pages.",
    "permissions": [
        "activeTab",
        "scripting",
        "storage"
    ],
    "host_permissions": [
        "https://api.vxtwitter.com/*"
    ],
    "icons": {
        "16": "icons/icon-16.png",
        "32": "icons/icon-32.png",
        "128": "icons/icon-128.png"
    },
    "action": {
        "default_title": "X Data Scraper",
        "default_icon": {
            "16": "icons/icon-16.png",
            "32": "icons/icon-32.png",
            "128": "icons/icon-128.png"
        }
    }
}
```

#### 2.3 准备应用商店资源

**图标要求**：
- 128x128px：应用商店列表图标（必需）
- 48x48px：扩展管理页面图标（可选）
- 16x16px：浏览器工具栏图标（必需）

**截图要求**：
- 至少一张，最多五张截图
- 尺寸：1280x800px 或 640x400px
- 格式：PNG 或 JPG
- 内容应展示扩展的核心功能

**宣传图（可选）**：
- 440x280px
- JPG 或 PNG
- 在应用商店首页展示

### 3. 创建 ZIP 包

1. 将整个 `chrome-extension` 文件夹压缩为 ZIP 文件
2. 确保 ZIP 包中包含所有必要的文件，不要包含源代码管理文件（如 .git 文件夹）
3. 将文件命名为 `x-data-scraper.zip` 或类似名称

## 发布流程

### 步骤 1：登录开发者仪表板

1. 访问 [Chrome Web Store 开发者仪表板](https://chrome.google.com/webstore/developer/dashboard)
2. 使用已支付注册费的 Google 账户登录

### 步骤 2：添加新项目

1. 点击"添加新项目"按钮
2. 同意条款和条件

### 步骤 3：上传扩展程序包

1. 点击"上传文件"按钮
2. 选择你准备的 ZIP 文件
3. 等待上传完成

### 步骤 4：填写商店列表信息

**权限理由（Justification for permissions）**：
在提交审核时，如果请求了敏感权限（如 `clipboardWrite`），需要提供使用理由。
- **clipboardWrite**:
  - **English**: "The extension requires the 'clipboardWrite' permission to allow users to copy tweet links directly to their clipboard. This feature is available in two contexts: 1) A 'Copy Link' button on the floating tooltip for individual tweets, and 2) A 'Copy Links' action in the sidebar to batch copy URLs of all scraped tweets for easy sharing or external use."
  - **中文**: "扩展程序请求 'clipboardWrite' 权限是为了允许用户将推文链接直接复制到剪贴板。该功能主要用于：1. 在单条推文的悬浮详情卡片中提供'复制链接'按钮；2. 在侧边栏中提供批量'复制链接'功能，方便用户导出抓取到的推文 URL。"

**基本信息**：
- **名称**：X Data Scraper（或你选择的名称）
- **描述**：简洁明了地描述扩展程序的功能
- **详细描述**：详细介绍功能、使用方法和特色
- **类别**：选择最适合的类别（可能是"生产力工具"）
- **语言**：选择支持的语言

**隐私实践**：
- 回答关于数据收集和使用的问题
- 如果不收集用户数据，请明确说明
- 如果使用第三方服务，请说明

### 步骤 5：上传图片资源

1. 上传之前准备的图标
2. 上传截图（至少一张）
3. 如有准备，上传宣传图

### 步骤 6：设置分发选项

- **可见性**：公开
- **地区**：选择你希望扩展程序可用的地区
- **定价**：免费（除非你想收费）

### 步骤 7：提交审核

1. 检查所有信息是否完整
2. 点击"提交审核"按钮
3. 等待审核结果（通常需要几天到一周时间）

## 审核过程与注意事项

### 审核标准

Google 会检查以下几个方面：

1. **安全性**：确保扩展程序不包含恶意代码
2. **隐私保护**：明确说明数据收集和使用情况
3. **用户体验**：确保扩展程序不会干扰用户浏览
4. **功能描述**：确保描述与实际功能一致
5. **代码质量**：检查是否有明显的错误或问题

### 常见拒绝原因

1. **权限过度**：只请求必要的权限
2. **隐私政策缺失**：如果收集任何用户数据，需要提供隐私政策
3. **功能描述不准确**：确保描述与实际功能一致
4. **恶意代码**：确保代码安全，不执行未经授权的操作
5. **用户体验差**：确保扩展程序不会干扰正常浏览

## 审核后

### 如果通过

恭喜！你的扩展程序已经发布到 Chrome Web Store。用户现在可以搜索并安装你的扩展程序。

### 如果被拒绝

1. 仔细阅读拒绝原因和反馈
2. 修复指出的问题
3. 重新打包并重新提交

## 维护与更新

发布后，你可能需要：

1. **修复 Bug**：根据用户反馈修复问题
2. **添加功能**：开发新功能
3. **更新版本**：
   - 修改 `manifest.json` 中的版本号
   - 打包新版本
   - 在开发者仪表板上传更新
4. **回复评价**：积极回应用户评价和反馈

## 推广策略

发布后，可以考虑以下推广策略：

1. **社交媒体宣传**：在相关平台分享你的扩展程序
2. **技术博客**：撰写文章介绍扩展程序的用途和功能
3. **技术社区**：在 Reddit、Hacker News 等社区分享
4. **用户反馈**：积极收集和响应用户反馈，改进产品

## 注意事项

1. **合规性**：确保你的扩展程序遵守 X/Twitter 的使用条款
2. **隐私保护**：明确告知用户数据的收集和使用情况
3. **持续更新**：定期更新扩展程序以适应网页变化
4. **用户支持**：提供渠道让用户报告问题和获取帮助

---

发布到 Chrome Web Store 需要耐心和细致的工作，但这是让你的项目触达更广泛用户的重要步骤。祝你好运！