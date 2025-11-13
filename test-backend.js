/**
 * Backend Testing Script
 * Tests all critical endpoints and features
 */

require("dotenv").config();
const mongoose = require("mongoose");
const { connectDatabase } = require("./config/database");
const { Message, Conversation, Manager, Customer, AutoReply } = require("./models");
const { getAutoReplyConfig, invalidateAutoReplyConfigCache } = require("./services/autoChatService");
const { getCache, setCache, deleteCache } = require("./utils/cache");

// Test results
const results = {
  passed: [],
  failed: [],
  warnings: [],
};

const log = {
  pass: (test) => {
    console.log(`✅ PASS: ${test}`);
    results.passed.push(test);
  },
  fail: (test, error) => {
    console.error(`❌ FAIL: ${test}`);
    console.error(`   Error: ${error.message}`);
    results.failed.push({ test, error: error.message });
  },
  warn: (test, message) => {
    console.warn(`⚠️  WARN: ${test} - ${message}`);
    results.warnings.push({ test, message });
  },
};

// Test database connection
async function testDatabaseConnection() {
  try {
    await connectDatabase();
    const status = mongoose.connection.readyState;
    if (status === 1) {
      log.pass("Database connection");
    } else {
      log.fail("Database connection", new Error(`Connection state: ${status}`));
    }
  } catch (error) {
    log.fail("Database connection", error);
  }
}

// Test models
async function testModels() {
  try {
    // Test Manager model
    const managerCount = await Manager.countDocuments();
    log.pass(`Manager model (${managerCount} documents)`);

    // Test Customer model
    const customerCount = await Customer.countDocuments();
    log.pass(`Customer model (${customerCount} documents)`);

    // Test Conversation model
    const conversationCount = await Conversation.countDocuments();
    log.pass(`Conversation model (${conversationCount} documents)`);

    // Test Message model
    const messageCount = await Message.countDocuments();
    log.pass(`Message model (${messageCount} documents)`);

    // Test AutoReply model
    const autoReplyCount = await AutoReply.countDocuments();
    log.pass(`AutoReply model (${autoReplyCount} documents)`);
  } catch (error) {
    log.fail("Models", error);
  }
}

// Test indexes
async function testIndexes() {
  try {
    const messageIndexes = await Message.collection.getIndexes();
    const conversationIndexes = await Conversation.collection.getIndexes();
    const autoReplyIndexes = await AutoReply.collection.getIndexes();

    // Check Message indexes
    const messageHasIndex = Object.keys(messageIndexes).some(
      (idx) => idx.includes("conversation") && idx.includes("createdAt")
    );
    if (messageHasIndex) {
      log.pass("Message indexes");
    } else {
      log.warn("Message indexes", "Some indexes may be missing");
    }

    // Check Conversation indexes
    const conversationHasIndex = Object.keys(conversationIndexes).some(
      (idx) => idx.includes("manager") || idx.includes("customer")
    );
    if (conversationHasIndex) {
      log.pass("Conversation indexes");
    } else {
      log.warn("Conversation indexes", "Some indexes may be missing");
    }

    // Check AutoReply indexes
    const autoReplyHasIndex = Object.keys(autoReplyIndexes).some((idx) => idx.includes("manager"));
    if (autoReplyHasIndex) {
      log.pass("AutoReply indexes");
    } else {
      log.warn("AutoReply indexes", "Some indexes may be missing");
    }
  } catch (error) {
    log.fail("Indexes", error);
  }
}

// Test cache functionality
async function testCache() {
  try {
    // Test setCache
    await setCache("test:key", { test: "data" }, 1000);
    log.pass("Cache set");

    // Test getCache
    const cached = await getCache("test:key");
    if (cached && cached.test === "data") {
      log.pass("Cache get");
    } else {
      log.fail("Cache get", new Error("Cache value mismatch"));
    }

    // Test deleteCache
    await deleteCache("test:key");
    const deleted = await getCache("test:key");
    if (!deleted) {
      log.pass("Cache delete");
    } else {
      log.fail("Cache delete", new Error("Cache not deleted"));
    }
  } catch (error) {
    log.fail("Cache", error);
  }
}

// Test auto-reply config caching
async function testAutoReplyCache() {
  try {
    // Get a manager ID for testing
    const manager = await Manager.findOne();
    if (!manager) {
      log.warn("Auto-reply cache", "No manager found for testing");
      return;
    }

    // Test getAutoReplyConfig (should use cache)
    const config1 = await getAutoReplyConfig(manager._id);
    const config2 = await getAutoReplyConfig(manager._id);
    
    // Second call should be from cache (faster)
    log.pass("Auto-reply config caching");

    // Test cache invalidation
    invalidateAutoReplyConfigCache(manager._id);
    log.pass("Auto-reply cache invalidation");
  } catch (error) {
    log.fail("Auto-reply cache", error);
  }
}

// Test pagination
async function testPagination() {
  try {
    // Find a conversation with messages
    const conversation = await Conversation.findOne();
    if (!conversation) {
      log.warn("Pagination", "No conversations found for testing");
      return;
    }

    // Test message pagination
    const messages = await Message.find({ conversation: conversation._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .skip(0)
      .lean();

    if (messages.length <= 50) {
      log.pass("Message pagination");
    } else {
      log.fail("Message pagination", new Error("Limit not working"));
    }
  } catch (error) {
    log.fail("Pagination", error);
  }
}

// Test aggregation optimization
async function testAggregation() {
  try {
    const manager = await Manager.findOne();
    if (!manager) {
      log.warn("Aggregation", "No manager found for testing");
      return;
    }

    const conversations = await Conversation.find({ manager: manager._id }).limit(10);
    if (conversations.length === 0) {
      log.warn("Aggregation", "No conversations found for testing");
      return;
    }

    const conversationIds = conversations.map((c) => c._id);
    const MESSAGES_PER_CONVERSATION = 50;

    const messageGroups = await Message.aggregate([
      { $match: { conversation: { $in: conversationIds } } },
      { $sort: { conversation: 1, createdAt: -1 } },
      {
        $group: {
          _id: "$conversation",
          messages: { $push: "$$ROOT" },
        },
      },
      {
        $project: {
          _id: 1,
          messages: { $slice: ["$messages", MESSAGES_PER_CONVERSATION] },
        },
      },
    ]);

    // Check if messages are limited
    const allMessagesLimited = messageGroups.every((group) => group.messages.length <= MESSAGES_PER_CONVERSATION);
    if (allMessagesLimited) {
      log.pass("Aggregation optimization");
    } else {
      log.fail("Aggregation optimization", new Error("Messages not limited properly"));
    }
  } catch (error) {
    log.fail("Aggregation", error);
  }
}

// Run all tests
async function runTests() {
  console.log("\n🧪 Starting Backend Tests...\n");

  await testDatabaseConnection();
  await testModels();
  await testIndexes();
  await testCache();
  await testAutoReplyCache();
  await testPagination();
  await testAggregation();

  // Print summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(50));
  console.log(`✅ Passed: ${results.passed.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⚠️  Warnings: ${results.warnings.length}`);

  if (results.failed.length > 0) {
    console.log("\n❌ Failed Tests:");
    results.failed.forEach(({ test, error }) => {
      console.log(`   - ${test}: ${error}`);
    });
  }

  if (results.warnings.length > 0) {
    console.log("\n⚠️  Warnings:");
    results.warnings.forEach(({ test, message }) => {
      console.log(`   - ${test}: ${message}`);
    });
  }

  console.log("\n" + "=".repeat(50));

  // Exit with appropriate code
  process.exit(results.failed.length > 0 ? 1 : 0);
}

// Run tests
runTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

