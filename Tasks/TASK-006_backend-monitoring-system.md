# TASK 6 — Backend Monitoring System with Auto-Fix

You are working in an existing Chrome Extension project for automating complaints checking on Wildberries marketplace.

**Context:** Wildberries updates their UI unpredictably, breaking CSS selectors and causing extension failures. Manual fixes take 2-3 hours and require developer intervention. This task creates a **fully automated monitoring system** that detects selector breakages and fixes them automatically using AI, reducing downtime from hours to minutes.

---

## Goal
Build a Node.js backend service that:
1. Monitors Wildberries complaints page every 6 hours using Puppeteer
2. Detects broken CSS selectors automatically
3. Uses GPT-4 to generate new stable selectors
4. Serves updated selectors to Chrome Extension via REST API
5. Sends Telegram alerts when issues are detected
6. Enables hot-reload in extension (no Chrome Web Store update needed)

**Business value:** Zero downtime when WB updates UI, automatic self-healing system.

---

## Background: Current Problem

**Manual process when selectors break:**
1. User reports extension is broken (lost time: 30 min - 2 hours)
2. Developer manually inspects WB page (1 hour)
3. Developer updates selectors in code (30 min)
4. Developer publishes new version to Chrome Web Store (1-24 hours moderation)
5. Users manually update extension

**Total downtime:** 3-27 hours

**Proposed automated process:**
1. Puppeteer monitor detects broken selector (0 minutes, instant)
2. AI generates new selector (2 minutes)
3. Backend publishes new selectors to API (instant)
4. Extension auto-reloads selectors (15 minutes via polling)
5. Developer receives Telegram notification with fix details

**Total downtime:** 15-20 minutes

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      CHROME EXTENSION                        │
│  ┌────────────────────────────────────────────────────┐     │
│  │ content.js                                         │     │
│  │ - Loads selectors from API on startup             │     │
│  │ - Polls API every 30 min for updates              │     │
│  │ - Falls back to embedded selectors if API down    │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            ↓ HTTP
┌─────────────────────────────────────────────────────────────┐
│                    NODE.JS BACKEND API                       │
│  ┌────────────────────────────────────────────────────┐     │
│  │ Express REST API                                   │     │
│  │ GET  /v1/selectors/latest                         │     │
│  │ GET  /v1/selectors/history                        │     │
│  │ POST /v1/health/report (optional telemetry)       │     │
│  └────────────────────────────────────────────────────┘     │
│  ┌────────────────────────────────────────────────────┐     │
│  │ Puppeteer Monitor (cron: every 6 hours)           │     │
│  │ - Opens WB page with real credentials            │     │
│  │ - Validates all 10 selectors                      │     │
│  │ - Triggers AI fixer if broken                     │     │
│  └────────────────────────────────────────────────────┘     │
│  ┌────────────────────────────────────────────────────┐     │
│  │ AI Selector Fixer (GPT-4)                         │     │
│  │ - Analyzes HTML structure                         │     │
│  │ - Generates 3 selector candidates                 │     │
│  │ - Tests candidates in Puppeteer                   │     │
│  │ - Selects best stable selector                    │     │
│  └────────────────────────────────────────────────────┘     │
│  ┌────────────────────────────────────────────────────┐     │
│  │ MongoDB Database                                   │     │
│  │ - selectors (current version)                     │     │
│  │ - selector_history (changelog)                    │     │
│  │ - health_reports (telemetry from extensions)      │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   NOTIFICATION SYSTEM                        │
│  - Telegram Bot: Alerts when selectors break                │
│  - Email: Daily health summary                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Scope (must implement)

### Part 1: Backend Infrastructure

#### Step 1.1: Initialize Node.js Project

**Create directory:** `backend/`

**Files to create:**
```
backend/
├── package.json
├── .env.example
├── .gitignore
├── server.js              # Express app entry point
├── config/
│   └── config.js          # Configuration (DB, API keys)
├── models/
│   ├── Selector.js        # Mongoose model for selectors
│   └── HealthReport.js    # Mongoose model for telemetry
├── routes/
│   ├── selectors.js       # GET /v1/selectors/*
│   └── health.js          # POST /v1/health/report
├── services/
│   ├── puppeteer-monitor.js    # WB page monitoring
│   ├── ai-selector-fixer.js    # GPT-4 selector generation
│   └── telegram-notifier.js    # Telegram alerts
├── utils/
│   ├── logger.js          # Winston logger
│   └── selectors.js       # Selector utilities
└── cron/
    └── monitor-job.js     # Cron job (every 6 hours)
```

**package.json:**
```json
{
  "name": "wb-extension-backend",
  "version": "1.0.0",
  "description": "Backend monitoring system for WB Chrome Extension",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "monitor": "node cron/monitor-job.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "mongoose": "^8.0.0",
    "puppeteer": "^21.6.0",
    "openai": "^4.20.0",
    "node-cron": "^3.0.3",
    "dotenv": "^16.3.1",
    "winston": "^3.11.0",
    "axios": "^1.6.2",
    "cors": "^2.8.5",
    "helmet": "^7.1.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}
```

**.env.example:**
```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/wb-extension

# OpenAI API
OPENAI_API_KEY=sk-...

# Telegram Bot
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...

# Server
PORT=3000
NODE_ENV=development

# WB Credentials (for Puppeteer monitoring)
WB_LOGIN=your_email@example.com
WB_PASSWORD=your_password

# API Security
API_SECRET_KEY=random_secret_key_here
```

---

#### Step 1.2: Create Express Server

**File: `backend/server.js`**

```javascript
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config/config');
const logger = require('./utils/logger');

// Routes
const selectorsRouter = require('./routes/selectors');
const healthRouter = require('./routes/health');

// Initialize app
const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/v1/selectors', selectorsRouter);
app.use('/v1/health', healthRouter);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'WB Extension Backend',
    version: '1.0.0',
    status: 'running'
  });
});

// Error handling
app.use((err, req, res, next) => {
  logger.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Connect to MongoDB
mongoose.connect(config.mongodbUri)
  .then(() => {
    logger.info('✅ Connected to MongoDB');

    // Start server
    const PORT = config.port;
    app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    logger.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

module.exports = app;
```

---

#### Step 1.3: Create Mongoose Models

**File: `backend/models/Selector.js`**

```javascript
const mongoose = require('mongoose');

const selectorSchema = new mongoose.Schema({
  version: {
    type: String,
    required: true,
    unique: true
  },
  selectors: {
    searchInput: { type: String, required: true },
    tableBody: { type: String, required: true },
    dateText: { type: String, required: true },
    statusChip: { type: String, required: true },
    sidebar: { type: String, required: true },
    productInfo: { type: String, required: true },
    feedbackInfo: { type: String, required: true },
    pagination: { type: String, required: true },
    paginationButton: { type: String, required: true }
  },
  metadata: {
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: String, default: 'auto' }, // 'auto' or 'manual'
    testResults: {
      tested: { type: Boolean, default: false },
      allPassed: { type: Boolean, default: false },
      details: { type: Object, default: {} }
    },
    notes: { type: String, default: '' }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Selector', selectorSchema);
```

**File: `backend/models/HealthReport.js`**

```javascript
const mongoose = require('mongoose');

const healthReportSchema = new mongoose.Schema({
  extensionVersion: String,
  userAgent: String,
  selectorVersion: String,
  timestamp: { type: Date, default: Date.now },
  results: {
    selectorsWorking: Number,
    selectorsBroken: Number,
    brokenSelectors: [String],
    apiAccess: {
      drive: Boolean,
      sheets: Boolean
    }
  },
  clientInfo: {
    cabinetId: String,
    cabinetName: String
  }
});

module.exports = mongoose.model('HealthReport', healthReportSchema);
```

---

#### Step 1.4: Create API Routes

**File: `backend/routes/selectors.js`**

```javascript
const express = require('express');
const router = express.Router();
const Selector = require('../models/Selector');
const logger = require('../utils/logger');

// GET /v1/selectors/latest
// Returns the latest active selector set
router.get('/latest', async (req, res) => {
  try {
    const selector = await Selector.findOne({ isActive: true })
      .sort({ createdAt: -1 })
      .select('-_id -__v');

    if (!selector) {
      return res.status(404).json({
        error: 'No active selectors found'
      });
    }

    res.json({
      version: selector.version,
      selectors: selector.selectors,
      metadata: {
        createdAt: selector.metadata.createdAt,
        createdBy: selector.metadata.createdBy
      }
    });

  } catch (error) {
    logger.error('Error fetching latest selectors:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /v1/selectors/history
// Returns all selector versions (for debugging)
router.get('/history', async (req, res) => {
  try {
    const selectors = await Selector.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .select('-_id -__v');

    res.json({
      count: selectors.length,
      selectors: selectors
    });

  } catch (error) {
    logger.error('Error fetching selector history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /v1/selectors/version/:version
// Returns specific version
router.get('/version/:version', async (req, res) => {
  try {
    const selector = await Selector.findOne({ version: req.params.version })
      .select('-_id -__v');

    if (!selector) {
      return res.status(404).json({
        error: `Version ${req.params.version} not found`
      });
    }

    res.json(selector);

  } catch (error) {
    logger.error('Error fetching selector version:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
```

**File: `backend/routes/health.js`**

```javascript
const express = require('express');
const router = express.Router();
const HealthReport = require('../models/HealthReport');
const logger = require('../utils/logger');

// POST /v1/health/report
// Extensions send health check results here
router.post('/report', async (req, res) => {
  try {
    const report = new HealthReport(req.body);
    await report.save();

    logger.info('Health report received:', {
      selectorVersion: report.selectorVersion,
      broken: report.results.selectorsBroken
    });

    // If many extensions report broken selectors, trigger monitor
    if (report.results.selectorsBroken > 2) {
      logger.warn('⚠️ Multiple broken selectors reported, triggering monitor');
      // TODO: Trigger monitor job
    }

    res.json({ success: true, id: report._id });

  } catch (error) {
    logger.error('Error saving health report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /v1/health/stats
// Returns aggregated health statistics
router.get('/stats', async (req, res) => {
  try {
    const recentReports = await HealthReport.find()
      .sort({ timestamp: -1 })
      .limit(100);

    const stats = {
      totalReports: recentReports.length,
      avgSelectorsWorking: 0,
      mostCommonBroken: {}
    };

    // Calculate stats
    recentReports.forEach(report => {
      stats.avgSelectorsWorking += report.results.selectorsWorking;

      report.results.brokenSelectors?.forEach(selector => {
        stats.mostCommonBroken[selector] = (stats.mostCommonBroken[selector] || 0) + 1;
      });
    });

    stats.avgSelectorsWorking = (stats.avgSelectorsWorking / recentReports.length).toFixed(1);

    res.json(stats);

  } catch (error) {
    logger.error('Error fetching health stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
```

---

### Part 2: Puppeteer Monitor

#### Step 2.1: Create Puppeteer Monitor Service

**File: `backend/services/puppeteer-monitor.js`**

```javascript
const puppeteer = require('puppeteer');
const logger = require('../utils/logger');
const config = require('../config/config');
const Selector = require('../models/Selector');

class PuppeteerMonitor {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async initialize() {
    logger.info('🔍 Initializing Puppeteer monitor...');

    this.browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1920, height: 1080 });
  }

  async loginToWB() {
    logger.info('🔐 Logging into Wildberries...');

    try {
      await this.page.goto('https://seller.wildberries.ru/', { waitUntil: 'networkidle2' });

      // TODO: Implement login flow
      // This depends on WB's auth system (email/password or OAuth)

      await this.page.type('input[type="email"]', config.wbLogin);
      await this.page.type('input[type="password"]', config.wbPassword);
      await this.page.click('button[type="submit"]');

      await this.page.waitForNavigation({ waitUntil: 'networkidle2' });

      logger.info('✅ Logged into Wildberries');

    } catch (error) {
      logger.error('❌ Failed to login to WB:', error);
      throw error;
    }
  }

  async navigateToComplaintsPage() {
    logger.info('📄 Navigating to complaints page...');

    await this.page.goto('https://seller.wildberries.ru/feedback-questions/questions', {
      waitUntil: 'networkidle2'
    });

    // Wait for page to fully load
    await this.page.waitForTimeout(3000);
  }

  async validateSelectors() {
    logger.info('🔍 Validating all selectors...');

    // Get current selectors from DB
    const currentSelector = await Selector.findOne({ isActive: true });

    if (!currentSelector) {
      throw new Error('No active selectors in database');
    }

    const selectors = currentSelector.selectors;
    const results = {
      version: currentSelector.version,
      tested: [],
      working: 0,
      broken: 0,
      brokenSelectors: []
    };

    for (const [name, selector] of Object.entries(selectors)) {
      try {
        const elements = await this.page.$$(selector);
        const found = elements.length > 0;

        results.tested.push({
          name,
          selector,
          found,
          count: elements.length
        });

        if (found) {
          results.working++;
        } else {
          results.broken++;
          results.brokenSelectors.push(name);
        }

        logger.info(`  ${found ? '✅' : '❌'} ${name}: ${found ? `found (${elements.length})` : 'NOT FOUND'}`);

      } catch (error) {
        logger.error(`  ❌ ${name}: Error testing selector`, error.message);
        results.broken++;
        results.brokenSelectors.push(name);
      }
    }

    return results;
  }

  async capturePageHTML() {
    logger.info('📸 Capturing page HTML...');

    const html = await this.page.content();

    return html;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      logger.info('🧹 Browser closed');
    }
  }

  async run() {
    try {
      await this.initialize();
      await this.loginToWB();
      await this.navigateToComplaintsPage();

      const validationResults = await this.validateSelectors();

      if (validationResults.broken > 0) {
        logger.warn(`⚠️ Found ${validationResults.broken} broken selectors!`);

        // Capture HTML for AI analysis
        const pageHTML = await this.capturePageHTML();

        // Trigger AI fixer
        const AIFixer = require('./ai-selector-fixer');
        const fixer = new AIFixer(this.page, pageHTML);

        const fixResults = await fixer.fixBrokenSelectors(
          validationResults.brokenSelectors,
          validationResults.tested
        );

        return { validationResults, fixResults };

      } else {
        logger.info('✅ All selectors working correctly');
        return { validationResults, fixResults: null };
      }

    } catch (error) {
      logger.error('❌ Monitor run failed:', error);
      throw error;

    } finally {
      await this.cleanup();
    }
  }
}

module.exports = PuppeteerMonitor;
```

---

### Part 3: AI Selector Fixer

#### Step 3.1: Create AI Fixer Service

**File: `backend/services/ai-selector-fixer.js`**

```javascript
const OpenAI = require('openai');
const logger = require('../utils/logger');
const config = require('../config/config');
const Selector = require('../models/Selector');
const { sendTelegramAlert } = require('./telegram-notifier');

class AISelectorFixer {
  constructor(puppeteerPage, pageHTML) {
    this.page = puppeteerPage;
    this.pageHTML = pageHTML;
    this.openai = new OpenAI({ apiKey: config.openaiApiKey });
  }

  async fixBrokenSelectors(brokenSelectorNames, allValidationResults) {
    logger.info(`🤖 AI Fixer: Processing ${brokenSelectorNames.length} broken selectors`);

    const fixes = [];

    for (const selectorName of brokenSelectorNames) {
      logger.info(`  🔧 Fixing: ${selectorName}`);

      const oldSelector = allValidationResults.find(r => r.name === selectorName)?.selector;

      // Generate new selector candidates using GPT-4
      const candidates = await this.generateSelectorCandidates(selectorName, oldSelector);

      // Test each candidate in real browser
      const testedCandidate = await this.testCandidates(selectorName, candidates);

      if (testedCandidate) {
        fixes.push({
          name: selectorName,
          oldSelector: oldSelector,
          newSelector: testedCandidate.selector,
          confidence: testedCandidate.confidence
        });

        logger.info(`  ✅ Fixed ${selectorName}: ${testedCandidate.selector}`);
      } else {
        logger.error(`  ❌ Could not fix ${selectorName}`);

        fixes.push({
          name: selectorName,
          oldSelector: oldSelector,
          newSelector: null,
          error: 'No working candidate found'
        });
      }
    }

    // If we successfully fixed all broken selectors, publish new version
    const allFixed = fixes.every(f => f.newSelector !== null);

    if (allFixed) {
      await this.publishNewSelectorVersion(fixes);
      await sendTelegramAlert(`✅ Auto-fixed ${fixes.length} selectors!`, fixes);
    } else {
      await sendTelegramAlert(`⚠️ Partial fix: ${fixes.filter(f => f.newSelector).length}/${fixes.length} selectors fixed`, fixes);
    }

    return fixes;
  }

  async generateSelectorCandidates(selectorName, oldSelector) {
    logger.info(`    🧠 Generating candidates for ${selectorName}...`);

    // Extract relevant HTML snippet for this element
    const relevantHTML = await this.extractRelevantHTML(selectorName);

    const prompt = `
You are a CSS selector expert. A Chrome extension uses this selector to find elements on Wildberries.ru, but it broke after a UI update.

**Element name:** ${selectorName}
**Old selector (broken):** ${oldSelector}

**Current HTML structure (excerpt):**
\`\`\`html
${relevantHTML}
\`\`\`

**Task:** Generate 3 CSS selector candidates that:
1. Are stable (won't break on next deploy)
2. Prefer data-* attributes or semantic attributes (name, role, aria-*)
3. Use [class*="prefix"] for hash-based classes
4. Are as specific as needed but no more

**Output format (JSON only):**
{
  "candidates": [
    { "selector": "...", "reasoning": "..." },
    { "selector": "...", "reasoning": "..." },
    { "selector": "...", "reasoning": "..." }
  ]
}
    `.trim();

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3
      });

      const result = JSON.parse(response.choices[0].message.content);

      logger.info(`    💡 Generated ${result.candidates.length} candidates`);

      return result.candidates;

    } catch (error) {
      logger.error(`    ❌ GPT-4 error:`, error);
      return [];
    }
  }

  async extractRelevantHTML(selectorName) {
    // Use heuristics to find relevant HTML section
    // For example, for searchInput, look for <input> elements

    const elementTypeMap = {
      searchInput: 'input[type="text"], input[type="search"]',
      tableBody: 'table tbody, [class*="table"]',
      dateText: '[class*="date"], [class*="Date"]',
      statusChip: '[class*="Chip"], [class*="chip"], [class*="Status"]',
      sidebar: '[class*="Sidebar"], [class*="Panel"]',
      pagination: '[class*="Pagination"], nav[aria-label*="pagination"]'
    };

    const fallbackSelector = elementTypeMap[selectorName] || 'div';

    try {
      const element = await this.page.$(fallbackSelector);

      if (element) {
        const html = await this.page.evaluate(el => {
          // Get element + 2 parent levels for context
          let current = el;
          for (let i = 0; i < 2; i++) {
            if (current.parentElement) current = current.parentElement;
          }
          return current.outerHTML;
        }, element);

        // Truncate to max 2000 chars (GPT-4 token limit consideration)
        return html.slice(0, 2000);
      }

    } catch (error) {
      logger.warn(`    Could not extract HTML for ${selectorName}, using full page excerpt`);
    }

    // Fallback: return first 2000 chars of page
    return this.pageHTML.slice(0, 2000);
  }

  async testCandidates(selectorName, candidates) {
    logger.info(`    🧪 Testing ${candidates.length} candidates...`);

    for (const candidate of candidates) {
      try {
        const elements = await this.page.$$(candidate.selector);

        if (elements.length === 1) {
          // Perfect! Found exactly 1 element
          logger.info(`      ✅ ${candidate.selector} → unique match`);
          return { ...candidate, confidence: 'high' };

        } else if (elements.length > 1 && elements.length <= 10) {
          // Found multiple, but reasonable (might be OK)
          logger.info(`      ⚠️ ${candidate.selector} → ${elements.length} matches`);
          return { ...candidate, confidence: 'medium' };

        } else if (elements.length > 10) {
          logger.warn(`      ❌ ${candidate.selector} → too many matches (${elements.length})`);
        } else {
          logger.warn(`      ❌ ${candidate.selector} → no matches`);
        }

      } catch (error) {
        logger.error(`      ❌ ${candidate.selector} → invalid selector`);
      }
    }

    // No working candidate found
    return null;
  }

  async publishNewSelectorVersion(fixes) {
    logger.info('📦 Publishing new selector version...');

    // Get current active selectors
    const currentSelector = await Selector.findOne({ isActive: true });

    // Create new version
    const newVersion = this.generateVersionString();
    const newSelectors = { ...currentSelector.selectors };

    // Apply fixes
    for (const fix of fixes) {
      newSelectors[fix.name] = fix.newSelector;
    }

    // Save to database
    const newSelectorDoc = new Selector({
      version: newVersion,
      selectors: newSelectors,
      metadata: {
        createdBy: 'auto',
        testResults: {
          tested: true,
          allPassed: true,
          details: { fixes }
        },
        notes: `Auto-fixed ${fixes.length} selectors: ${fixes.map(f => f.name).join(', ')}`
      },
      isActive: true
    });

    await newSelectorDoc.save();

    // Deactivate old version
    await Selector.updateMany(
      { _id: { $ne: newSelectorDoc._id } },
      { isActive: false }
    );

    logger.info(`✅ Published version ${newVersion}`);

    return newVersion;
  }

  generateVersionString() {
    const now = new Date();
    return `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}-${now.getHours()}${now.getMinutes()}`;
  }
}

module.exports = AISelectorFixer;
```

---

### Part 4: Telegram Notifications

**File: `backend/services/telegram-notifier.js`**

```javascript
const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config/config');

async function sendTelegramAlert(message, details = null) {
  if (!config.telegramBotToken || !config.telegramChatId) {
    logger.warn('Telegram not configured, skipping alert');
    return;
  }

  let text = `🔔 *WB Extension Alert*\n\n${message}`;

  if (details) {
    text += '\n\n*Details:*\n';

    if (Array.isArray(details)) {
      details.forEach(d => {
        text += `\n• ${d.name}: ${d.oldSelector} → ${d.newSelector || 'FAILED'}`;
      });
    } else {
      text += `\n\`\`\`json\n${JSON.stringify(details, null, 2)}\n\`\`\``;
    }
  }

  text += `\n\n_${new Date().toLocaleString('ru-RU')}_`;

  try {
    await axios.post(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
      chat_id: config.telegramChatId,
      text: text,
      parse_mode: 'Markdown'
    });

    logger.info('📱 Telegram alert sent');

  } catch (error) {
    logger.error('❌ Failed to send Telegram alert:', error.message);
  }
}

module.exports = { sendTelegramAlert };
```

---

### Part 5: Cron Job

**File: `backend/cron/monitor-job.js`**

```javascript
const cron = require('node-cron');
const logger = require('../utils/logger');
const PuppeteerMonitor = require('../services/puppeteer-monitor');
const { sendTelegramAlert } = require('../services/telegram-notifier');

// Run every 6 hours: 0 */6 * * *
// For testing, use: */5 * * * * (every 5 minutes)

const cronExpression = '0 */6 * * *'; // Every 6 hours at :00

logger.info(`⏰ Scheduling monitor job: ${cronExpression}`);

cron.schedule(cronExpression, async () => {
  logger.info('🔍 === CRON JOB STARTED ===');

  try {
    const monitor = new PuppeteerMonitor();
    const results = await monitor.run();

    if (results.fixResults) {
      logger.info('✅ Monitoring completed with auto-fixes');
    } else {
      logger.info('✅ Monitoring completed, all selectors working');
    }

  } catch (error) {
    logger.error('❌ Monitoring job failed:', error);

    await sendTelegramAlert(
      '⚠️ Monitoring job failed!',
      { error: error.message, stack: error.stack }
    );
  }

  logger.info('🔍 === CRON JOB FINISHED ===\n');
});

// Run immediately on startup (for testing)
if (process.env.RUN_ON_STARTUP === 'true') {
  logger.info('🚀 Running monitor immediately (RUN_ON_STARTUP=true)...');

  (async () => {
    const monitor = new PuppeteerMonitor();
    await monitor.run();
    process.exit(0);
  })();
}

logger.info('✅ Monitor cron job scheduled');
```

---

### Part 6: Extension Integration

#### Step 6.1: Create Selector API Client

**File to create in extension:** `src/services/selector-api.js`

```javascript
/**
 * Selector API Client
 * Загружает актуальные селекторы с backend API
 */

const API_BASE_URL = 'https://api.rating5.ru'; // TODO: Replace with your domain

class SelectorAPI {
  constructor() {
    this.cache = null;
    this.cacheExpiry = null;
    this.CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Получить актуальные селекторы
   * @returns {Object} SELECTORS объект
   */
  async getLatestSelectors() {
    console.log('🌐 [API] Fetching latest selectors from server...');

    try {
      // Проверяем кэш
      if (this.cache && this.cacheExpiry && Date.now() < this.cacheExpiry) {
        console.log('✅ [API] Using cached selectors');
        return this.cache;
      }

      // Запрашиваем с сервера
      const response = await fetch(`${API_BASE_URL}/v1/selectors/latest`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 5000 // 5 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      console.log(`✅ [API] Loaded selectors version ${data.version}`);

      // Сохраняем в кэш
      this.cache = data.selectors;
      this.cacheExpiry = Date.now() + this.CACHE_DURATION;

      // Сохраняем в chrome.storage для offline использования
      await chrome.storage.local.set({
        cachedSelectors: data.selectors,
        cachedVersion: data.version,
        cachedAt: Date.now()
      });

      return data.selectors;

    } catch (error) {
      console.error('❌ [API] Failed to fetch selectors from server:', error);

      // Fallback 1: Используем кэш из chrome.storage
      const cached = await chrome.storage.local.get(['cachedSelectors', 'cachedVersion']);

      if (cached.cachedSelectors) {
        console.warn('⚠️ [API] Using cached selectors from storage (version: ' + cached.cachedVersion + ')');
        return cached.cachedSelectors;
      }

      // Fallback 2: Используем embedded селекторы из content.js
      console.warn('⚠️ [API] Using embedded selectors (fallback)');
      return null; // content.js will use its embedded SELECTORS
    }
  }

  /**
   * Отправить health report на сервер (телеметрия)
   */
  async sendHealthReport(results) {
    try {
      await fetch(`${API_BASE_URL}/v1/health/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          extensionVersion: chrome.runtime.getManifest().version,
          userAgent: navigator.userAgent,
          selectorVersion: results.selectorVersion || 'unknown',
          timestamp: new Date().toISOString(),
          results: {
            selectorsWorking: results.foundCount,
            selectorsBroken: results.brokenCount,
            brokenSelectors: results.brokenSelectors || []
          }
        })
      });

      console.log('📊 [API] Health report sent');

    } catch (error) {
      console.error('❌ [API] Failed to send health report:', error);
      // Non-critical, ignore
    }
  }
}

// Export singleton instance
window.SelectorAPI = new SelectorAPI();
```

---

#### Step 6.2: Modify content.js to Use API Selectors

**File to modify:** `content.js`

**Add at the top (after SELECTORS definition):**

```javascript
// ============================================
// EMBEDDED SELECTORS (FALLBACK)
// ============================================
const EMBEDDED_SELECTORS = {
  searchInput: 'input[name="feedback-search-name-input"]',
  tableBody: '[data-testid="Base-table-body"]',
  // ... all other selectors ...
};

// ============================================
// LOAD SELECTORS FROM API (WITH FALLBACK)
// ============================================
let SELECTORS = { ...EMBEDDED_SELECTORS }; // Start with embedded

(async function loadSelectorsFromAPI() {
  try {
    // Load selector-api.js
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('services/selector-api.js');
    document.head.appendChild(script);

    // Wait for script to load
    await new Promise(resolve => script.onload = resolve);

    // Fetch latest selectors
    const apiSelectors = await window.SelectorAPI.getLatestSelectors();

    if (apiSelectors) {
      SELECTORS = apiSelectors;
      console.log('✅ Loaded selectors from API');
    } else {
      console.warn('⚠️ Using embedded selectors (API unavailable)');
    }

  } catch (error) {
    console.error('❌ Failed to load selectors from API, using embedded:', error);
  }
})();

// ============================================
// POLL FOR SELECTOR UPDATES (EVERY 30 MIN)
// ============================================
setInterval(async () => {
  console.log('🔄 Checking for selector updates...');

  try {
    const apiSelectors = await window.SelectorAPI.getLatestSelectors();

    if (apiSelectors && JSON.stringify(apiSelectors) !== JSON.stringify(SELECTORS)) {
      SELECTORS = apiSelectors;
      console.log('✅ Selectors updated from API (hot reload)');

      // Optionally reload the page to apply new selectors
      // location.reload();
    }

  } catch (error) {
    console.error('❌ Failed to check for updates:', error);
  }
}, 30 * 60 * 1000); // 30 minutes
```

---

## Deployment

### Option 1: DigitalOcean Droplet

1. Create Ubuntu 22.04 droplet ($6/month)
2. Install Node.js, MongoDB, PM2
3. Clone backend code
4. Configure .env
5. Run: `pm2 start server.js`
6. Setup Nginx reverse proxy with SSL

### Option 2: Heroku

1. Create Heroku app
2. Add MongoDB addon (mLab or Atlas)
3. Set environment variables
4. Deploy: `git push heroku main`

### Option 3: Railway.app

1. Connect GitHub repo
2. Deploy automatically on push
3. Add MongoDB database
4. Configure environment variables

---

## Non-goals
- Do NOT implement user authentication (API is read-only public)
- Do NOT store user credentials in backend
- Do NOT modify extension core logic beyond selector loading

---

## Definition of Done
- [ ] Backend Express server created and running
- [ ] MongoDB models defined (Selector, HealthReport)
- [ ] REST API endpoints implemented (/v1/selectors/latest, /v1/health/report)
- [ ] Puppeteer monitor service validates all 10 selectors
- [ ] AI Selector Fixer generates and tests candidates with GPT-4
- [ ] Telegram notifications work
- [ ] Cron job runs every 6 hours
- [ ] Extension loads selectors from API on startup
- [ ] Extension polls for updates every 30 minutes
- [ ] Extension falls back to embedded selectors if API is down
- [ ] Tested end-to-end: break selector manually, verify auto-fix
- [ ] Deployed to server (DigitalOcean/Heroku/Railway)
- [ ] Documentation updated with API endpoints

---

**Priority:** LOW (long-term infrastructure)
**Estimated effort:** 8-12 hours (including server setup)
**Dependencies:** OpenAI API key, Telegram bot, Server (VPS or Heroku)
**Cost:** $5-15/month (server + OpenAI API usage)

---

## ROI Analysis

**Manual process cost:**
- Developer time: 2-3 hours × $50/hour = $100-150 per incident
- User downtime: 3-27 hours × lost productivity

**Automated system cost:**
- Setup: 8-12 hours (one-time)
- Monthly: $10 (server) + $5 (OpenAI) = $15/month
- Maintenance: ~1 hour/month

**Break-even:** After 2 incidents (likely 3-6 months)

**Long-term benefit:** Zero downtime, happier users, no manual interventions
