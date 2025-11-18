const { Message, Conversation, Manager, AutoReply } = require("../models");
const { createMessage } = require("./messageService");
const { getConversationById } = require("./conversationService");

const MAX_AUTO_CHAT_MESSAGES = 10;

// Default services (fallback if manager hasn't configured)
const DEFAULT_SERVICES = [
  { name: "Head Massage", description: "60 min | ₹1,999", action: "service_head_massage" },
  { name: "Foot Reflexology", description: "60 min | ₹1,999", action: "service_foot_reflexology" },
  { name: "Back Massage", description: "60 min | ₹1,999", action: "service_back_massage" },
  { name: "Full Body Dry Massage", description: "60 min | ₹1,999", action: "service_full_body_dry" },
  {
    name: "Full Body Oil Massage",
    description: "60 min | ₹1,999 · 90 min | ₹2,999",
    action: "service_full_body_oil",
  },
  {
    name: "Full Body Oil Massage + Jacuzzi",
    description: "60 min | ₹3,999 · 90 min | ₹4,999 · 120 min | ₹5,999",
    action: "service_full_body_oil_jacuzzi",
  },
  {
    name: "Four Hand Couple Special",
    description: "60 min | ₹3,999 · 90 min | ₹5,999 · 120 min | ₹7,999",
    action: "service_four_hand_couple_special",
  },
  {
    name: "Four Hand Couple + Jacuzzi",
    description: "60 min | ₹5,999 · 90 min | ₹7,999 · 120 min | ₹9,999",
    action: "service_four_hand_couple_jacuzzi",
  },
  {
    name: "Full Body Massage + Scrub",
    description: "60 min | ₹2,499 · 90 min | ₹3,499",
    action: "service_body_scrub",
  },
  {
    name: "Full Body Massage + Scrub + Jacuzzi",
    description: "60 min | ₹4,499 · 90 min | ₹5,499 · 120 min | ₹7,499",
    action: "service_body_scrub_jacuzzi",
  },
  {
    name: "Full Body Thai Massage",
    description: "60 min | ₹2,499 · 90 min | ₹3,499 · 120 min | ₹4,499",
    action: "service_thai",
  },
  {
    name: "Full Body Thai Massage + Jacuzzi",
    description: "60 min | ₹3,999 · 90 min | ₹4,999 · 120 min | ₹5,999",
    action: "service_thai_jacuzzi",
  },
  {
    name: "Full Body Thai Massage + Scrub",
    description: "60 min | ₹2,999 · 90 min | ₹3,999 · 120 min | ₹4,999",
    action: "service_thai_scrub",
  },
  {
    name: "Full Body Thai Massage + Scrub + Jacuzzi",
    description: "60 min | ₹4,499 · 90 min | ₹5,499 · 120 min | ₹6,499",
    action: "service_thai_scrub_jacuzzi",
  },
  {
    name: "Four Hand Massage",
    description: "60 min | ₹3,499 · 90 min | ₹4,999 · 120 min | ₹6,499",
    action: "service_four_hand",
  },
  {
    name: "Four Hand Massage + Jacuzzi",
    description: "60 min | ₹4,999 · 90 min | ₹6,499 · 120 min | ₹7,999",
    action: "service_four_hand_jacuzzi",
  },
  {
    name: "Four Hand Massage + Scrub",
    description: "60 min | ₹4,499 · 90 min | ₹5,999 · 120 min | ₹7,499",
    action: "service_four_hand_scrub",
  },
  {
    name: "Four Hand Massage + Scrub + Jacuzzi",
    description: "60 min | ₹5,999 · 90 min | ₹7,499 · 120 min | ₹8,999",
    action: "service_four_hand_scrub_jacuzzi",
  },
  {
    name: "French Aroma Massage",
    description: "60 min | ₹1,999 · 90 min | ₹2,999 · 120 min | ₹3,999",
    action: "service_french_aroma",
  },
  {
    name: "Swedish Massage",
    description: "60 min | ₹1,999 · 90 min | ₹2,999 · 120 min | ₹3,999",
    action: "service_swedish",
  },
  {
    name: "Balinese Massage",
    description: "60 min | ₹2,499 · 90 min | ₹3,499 · 120 min | ₹4,499",
    action: "service_balinese",
  },
  {
    name: "Deep Tissue Massage",
    description: "60 min | ₹2,799 · 90 min | ₹3,799 · 120 min | ₹4,799",
    action: "service_deep_tissue",
  },
  {
    name: "Lomi Lomi Massage",
    description: "60 min | ₹2,499 · 90 min | ₹3,499 · 120 min | ₹4,499",
    action: "service_lomi_lomi",
  },
  {
    name: "Heritage Ladies Special",
    description: "60 min | ₹3,499 · 90 min | ₹4,499",
    action: "service_heritage_ladies",
  },
];

// Default time slots (fallback if manager hasn't configured)
const DEFAULT_TIME_SLOTS = [
  { label: "10:00 AM – 12:00 PM", action: "slot_morning" },
  { label: "12:00 PM – 2:00 PM", action: "slot_midday" },
  { label: "2:00 PM – 4:00 PM", action: "slot_afternoon" },
  { label: "4:00 PM – 6:00 PM", action: "slot_evening" },
];

const SERVICE_CHUNK_SIZE = 5;

// Cache for auto-reply configs (5 minute TTL)
const autoReplyConfigCache = new Map();

// Helper to get auto-reply configuration for a manager (with caching)
const getAutoReplyConfig = async (managerId) => {
  try {
    const cacheKey = `auto-reply:${managerId}`;
    const cached = autoReplyConfigCache.get(cacheKey);
    
    // Return cached config if available and not expired (5 minutes)
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      return cached.data;
    }
    
    const autoReply = await AutoReply.findOne({ manager: managerId, isActive: true }).lean();
    
    // Cache the result
    if (autoReply) {
      autoReplyConfigCache.set(cacheKey, {
        data: autoReply,
        timestamp: Date.now(),
      });
    }
    
    return autoReply;
  } catch (error) {
    console.error("Failed to get auto-reply config:", error);
    return null;
  }
};

// Helper to invalidate auto-reply config cache
const invalidateAutoReplyConfigCache = (managerId) => {
  const cacheKey = `auto-reply:${managerId}`;
  autoReplyConfigCache.delete(cacheKey);
};

// Cleanup expired cache entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  const TTL = 5 * 60 * 1000; // 5 minutes
  for (const [key, value] of autoReplyConfigCache.entries()) {
    if (now - value.timestamp > TTL) {
      autoReplyConfigCache.delete(key);
    }
  }
}, 10 * 60 * 1000);

// Helper to get manager details
const getManagerDetails = async (managerId) => {
  try {
    const manager = await Manager.findById(managerId).lean();
    if (!manager) return null;

    const businessName = manager.businessName || "Our Spa";
    const phone = manager.mobileNumber || "+91 9125846358";
    const locationLink = `https://maps.google.com/?q=${encodeURIComponent(businessName)}`;

    return {
      businessName,
      phone,
      locationLink,
      managerName: manager.managerName || businessName,
    };
  } catch (error) {
    console.error("Failed to get manager details:", error);
    return {
      businessName: "Our Spa",
      phone: "+91 9125846358",
      locationLink: "https://maps.google.com/?q=Spa+Location",
      managerName: "Manager",
    };
  }
};

// Helper to format date
const formatDate = (date) => {
  if (!date) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    date = tomorrow;
  }
  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

// Helper to get booking state from conversation metadata
const getBookingState = (conversation) => {
  if (!conversation.metadata) return null;
  const bookingData = conversation.metadata.bookingData;
  if (!bookingData) return null;
  return bookingData;
};

// Helper to save booking state to conversation metadata
const saveBookingState = async (conversationId, bookingData) => {
  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return;

    if (!conversation.metadata) {
      conversation.metadata = {};
    }
    conversation.metadata.bookingData = {
      ...(conversation.metadata.bookingData || {}),
      ...bookingData,
    };
    await conversation.save();
  } catch (error) {
    console.error("Failed to save booking state:", error);
  }
};

// Welcome message with quick reply options
const getWelcomeMessage = async (_managerName, customerName, managerBusinessName, managerDetails, autoReplyConfig) => {
  const locationLink = managerDetails?.locationLink || "https://maps.google.com/?q=Spa+Location";

  // Use custom welcome message if available, otherwise use default
  if (autoReplyConfig?.welcomeMessage?.content) {
    // Replace placeholders in custom message
    let content = autoReplyConfig.welcomeMessage.content
      .replace(/\{customerName\}/g, customerName || "Valued Guest")
      .replace(/\{businessName\}/g, managerBusinessName || "Our Spa")
      .replace(/\{locationLink\}/g, locationLink);

    return {
      content,
      quickReplies: autoReplyConfig.welcomeMessage.quickReplies || [],
    };
  }

  // Default welcome message
  return {
    content: `Welcome, ${customerName || "Guest"}! 🌿\n\nYou’ve reached ${managerBusinessName || "Our Spa"}, where every visit is personalised and unrushed. If it’s your first time with us, you’re entitled to **10% off** or a **complimentary 15-minute neck ritual** with any full treatment.\n\nTap *Explore Bookings* to browse curated massages, or choose a quick option below and I’ll stay with you until everything is confirmed.`,
    quickReplies: [
      { text: "Book Now", action: "book_now" },
      { text: "Services & Pricing", action: "services_pricing" },
      { text: "Complimentary Offer", action: "claim_offer" },
      { text: "Call Concierge", action: "call_spa" },
    ],
  };
};

// Get bot response based on customer message
const getBotResponse = async (message, action = null, _messageCount = 0, conversation = null, managerDetails = null, customerName = null, autoReplyConfig = null) => {
  const lowerMessage = (message || "").toLowerCase().trim();

  // Get services and time slots from config or defaults
  const services = autoReplyConfig?.services && autoReplyConfig.services.length > 0
    ? autoReplyConfig.services
    : DEFAULT_SERVICES;
  const timeSlots = autoReplyConfig?.timeSlots && autoReplyConfig.timeSlots.length > 0
    ? autoReplyConfig.timeSlots
    : DEFAULT_TIME_SLOTS;
  const bookingState = conversation ? getBookingState(conversation) : null;

  // Check if customer wants to talk with manager
  if (
    action === "talk_with_manager" ||
    lowerMessage.includes("talk with manager") ||
    lowerMessage.includes("speak with manager") ||
    lowerMessage.includes("connect with manager") ||
    lowerMessage.includes("human") ||
    lowerMessage.includes("real person")
  ) {
    const customResponse = autoReplyConfig?.responses?.talkWithManager;
    if (customResponse?.content) {
      return {
        content: customResponse.content,
        quickReplies: customResponse.quickReplies || [],
        disableAutoChat: true,
      };
    }
    return {
      content: "I'll connect you with our manager right away! They'll respond to you shortly. Kindly wait for a few minutes.😊",
      quickReplies: [],
      disableAutoChat: true,
    };
  }

  // Claim welcome offer
  if (
    action === "claim_offer" ||
    lowerMessage.includes("claim") ||
    (lowerMessage.includes("yes") && lowerMessage.includes("offer"))
  ) {
    const customResponse = autoReplyConfig?.responses?.claimOffer;
    if (customResponse?.content) {
      const serviceList = services.slice(0, 3)
        .map((service) => `• ${service.name} – ${service.description}`)
        .join("\n");
      
      let content = customResponse.content.replace(/\{serviceList\}/g, serviceList);
      
      return {
        content,
        quickReplies: customResponse.quickReplies.length > 0
          ? customResponse.quickReplies
          : [
              ...services.slice(0, 3).map((service) => ({
                text: service.name,
                action: service.action,
              })),
              { text: "View Treatments", action: "services_pricing" },
              { text: "Call Concierge", action: "call_spa" },
            ],
        bookingData: { offerClaimed: true },
      };
    }

    // Default response
    const serviceList = services.slice(0, 3)
      .map((service) => `• ${service.name} – ${service.description}`)
      .join("\n");

    return {
      content:
        "Perfect! 🎉 You've unlocked **10% off** or a **FREE 15-min neck & shoulder massage** with any paid service.\n\nHere are our guest favorites:\n" +
        serviceList +
        "\n\nReady to choose your pampering experience?",
      quickReplies: [
        ...services.slice(0, 3).map((service) => ({
          text: service.name,
          action: service.action,
        })),
        { text: "View Treatments", action: "services_pricing" },
        { text: "Call Concierge", action: "call_spa" },
      ],
      bookingData: { offerClaimed: true },
    };
  }

  // Services & pricing overview
  if (
    action === "services_pricing" ||
    lowerMessage.includes("service") ||
    lowerMessage.includes("menu") ||
    lowerMessage.includes("price") ||
    lowerMessage.includes("pricing")
  ) {
    const customResponse = autoReplyConfig?.responses?.servicesPricing;
    const topServices = services.slice(0, SERVICE_CHUNK_SIZE);
    const hasMoreServices = services.length > SERVICE_CHUNK_SIZE;
    const topServiceList = topServices.map((service) => `• ${service.name} — ${service.description}`).join("\n");
    const displayServiceList =
      topServiceList +
      (hasMoreServices ? "\n\n…plus additional bespoke treatments on request." : "");
    const nextOffset = hasMoreServices ? SERVICE_CHUNK_SIZE : services.length;
    const bookingDataUpdate = {
      ...(bookingState || {}),
      serviceBrowseOffset: nextOffset,
      servicesFullyBrowsed: !hasMoreServices,
    };

    if (customResponse?.content) {
      let content = customResponse.content.replace(/\{serviceList\}/g, displayServiceList);
      
      return {
        content,
        quickReplies: customResponse.quickReplies.length > 0
          ? customResponse.quickReplies
          : [
              ...topServices.slice(0, 3).map((service) => ({
                text: service.name,
                action: service.action,
              })),
              { text: "Reserve a Slot", action: "book_now" },
              { text: "Complimentary Offer", action: "claim_offer" },
              ...(hasMoreServices ? [{ text: "More Treatments", action: "services_more" }] : []),
            ],
        bookingData: bookingDataUpdate,
      };
    }

    // Default response
    return {
      content:
        "Here’s a curated look at our signature rituals:\n\n" +
        displayServiceList +
        "\n\nEvery visit includes a welcome elixir, aromatherapy lounge access, and a personalised wellness consult. Would you like me to reserve a time?",
      quickReplies: [
        ...topServices.slice(0, 3).map((service) => ({
          text: service.name,
          action: service.action,
        })),
        { text: "Reserve a Slot", action: "book_now" },
        { text: "Complimentary Offer", action: "claim_offer" },
        ...(hasMoreServices ? [{ text: "More Treatments", action: "services_more" }] : []),
      ],
      bookingData: bookingDataUpdate,
    };
  }

  if (action === "services_more") {
    const currentOffset = bookingState?.serviceBrowseOffset ?? SERVICE_CHUNK_SIZE;
    const remainingServices = services.slice(currentOffset, currentOffset + SERVICE_CHUNK_SIZE);
    if (remainingServices.length === 0) {
      return {
        content: "You’ve already viewed the full menu. I’d be happy to recommend something if you tell me the mood you’re in.",
        quickReplies: [
          { text: "Reserve a Slot", action: "book_now" },
          { text: "Complimentary Offer", action: "claim_offer" },
          { text: "Call Concierge", action: "call_spa" },
        ],
        bookingData: {
          ...(bookingState || {}),
          servicesFullyBrowsed: true,
          serviceBrowseOffset: services.length,
        },
      };
    }

    const remainingList = remainingServices.map((service) => `• ${service.name} — ${service.description}`).join("\n");
    const nextOffset = currentOffset + remainingServices.length;
    const hasMore = services.length > nextOffset;

    return {
      content:
        "Here are additional treatments our guests love:\n\n" +
        remainingList +
        "\n\nTell me which one interests you and I’ll line up the best time.",
      quickReplies: [
        ...remainingServices.slice(0, 3).map((service) => ({
          text: service.name,
          action: service.action,
        })),
        { text: "Reserve a Slot", action: "book_now" },
        { text: "Complimentary Offer", action: "claim_offer" },
        { text: "Call Concierge", action: "call_spa" },
        ...(hasMore ? [{ text: "More Treatments", action: "services_more" }] : []),
      ],
      bookingData: {
        ...(bookingState || {}),
        serviceBrowseOffset: nextOffset,
        servicesFullyBrowsed: !hasMore,
      },
    };
  }

  // Booking flow
  if (
    action === "book_now" ||
    lowerMessage.includes("book") ||
    lowerMessage.includes("appointment") ||
    lowerMessage.includes("schedule")
  ) {
    const customResponse = autoReplyConfig?.responses?.bookNow;
    if (customResponse?.content) {
      return {
        content: customResponse.content,
        quickReplies: customResponse.quickReplies.length > 0
          ? customResponse.quickReplies
          : [
              ...services.slice(0, 3).map((service) => ({
                text: service.name,
                action: service.action,
              })),
              { text: "View More Services", action: "services_pricing" },
              { text: "Call Concierge", action: "call_spa" },
              { text: "Visit Us", action: "spa_location" },
            ],
      };
    }

    return {
      content:
        "Lovely. Tell me which ritual you’re in the mood for and I’ll hold the calmest slot for you.",
      quickReplies: [
        ...services.slice(0, 3).map((service) => ({
          text: service.name,
          action: service.action,
        })),
        { text: "View More Services", action: "services_pricing" },
        { text: "Call Concierge", action: "call_spa" },
        { text: "Visit Us", action: "spa_location" },
      ],
    };
  }

  // Service selection
  const selectedService = services.find(
    (service) =>
      action === service.action ||
      lowerMessage.includes(service.name.toLowerCase()),
  );

  if (selectedService) {
    const customResponse = autoReplyConfig?.responses?.serviceSelected;
    
    if (customResponse?.content) {
      let content = customResponse.content
        .replace(/\{serviceName\}/g, selectedService.name)
        .replace(/\{serviceDescription\}/g, selectedService.description);
      
      return {
        content,
        quickReplies: customResponse.quickReplies.length > 0
          ? customResponse.quickReplies
          : [
              ...timeSlots.map((slot) => ({
                text: slot.label,
                action: slot.action,
              })),
              { text: "Change Service", action: "book_now" },
              { text: "Call the Spa", action: "call_spa" },
            ],
        bookingData: {
          ...(bookingState || {}),
          service: selectedService.name,
          serviceDescription: selectedService.description,
        },
      };
    }

    return {
      content: `Excellent choice! 🌟 **${selectedService.name}** (${selectedService.description})\n\nLet me know which time frame works best for you, and I'll reserve a cozy suite.`,
      quickReplies: [
        ...timeSlots.map((slot) => ({
          text: slot.label,
          action: slot.action,
        })),
        { text: "Change Service", action: "book_now" },
        { text: "Call the Spa", action: "call_spa" },
      ],
      bookingData: {
        ...(bookingState || {}),
        service: selectedService.name,
        serviceDescription: selectedService.description,
      },
    };
  }

  // Time slot selection
  const selectedSlot = timeSlots.find(
    (slot) =>
      action === slot.action || lowerMessage.includes(slot.label.toLowerCase()),
  );

  if (selectedSlot) {
    const serviceName = bookingState?.service || "Your selected treatment";
    const serviceDesc = bookingState?.serviceDescription || "";
    const businessName = managerDetails?.businessName || "Our Spa";
    const locationLink = managerDetails?.locationLink || "https://maps.google.com/?q=Spa+Location";
    const phone = managerDetails?.phone || "+91 9876543210";
    const managerName = managerDetails?.managerName || "Our Team";

    // Get customer name from conversation metadata or parameter
    const customerDisplayName = customerName ||
      conversation?.metadata?.customerName ||
      conversation?.customer?.name ||
      "Valued Guest";

    // Generate a date (tomorrow by default, or use stored date)
    let appointmentDate;
    if (bookingState?.date) {
      appointmentDate = bookingState.date instanceof Date ? bookingState.date : new Date(bookingState.date);
    } else {
      // Default to tomorrow
      appointmentDate = new Date();
      appointmentDate.setDate(appointmentDate.getDate() + 1);
    }

    // Ensure date is valid
    if (isNaN(appointmentDate.getTime())) {
      appointmentDate = new Date();
      appointmentDate.setDate(appointmentDate.getDate() + 1);
    }

    const formattedDate = formatDate(appointmentDate);

    // Determine if offer was claimed (check if conversation has offer claimed flag)
    const offerClaimed = bookingState?.offerClaimed === true;

    const offerText = offerClaimed ? " + FREE Neck Massage / 10% OFF" : "";
    const customResponse = autoReplyConfig?.responses?.bookingConfirmed;

    if (customResponse?.content) {
      let content = customResponse.content
        .replace(/\{customerName\}/g, customerDisplayName || "Valued Guest")
        .replace(/\{date\}/g, formattedDate)
        .replace(/\{time\}/g, selectedSlot.label)
        .replace(/\{serviceName\}/g, serviceName)
        .replace(/\{offerText\}/g, offerText)
        .replace(/\{therapistName\}/g, managerName || "Our Therapist")
        .replace(/\{locationLink\}/g, locationLink)
        .replace(/\{businessName\}/g, businessName);

      return {
        content,
        quickReplies: customResponse.quickReplies.length > 0
          ? customResponse.quickReplies
          : [
              { text: "Change Time", action: "book_now" },
              { text: "View Location", action: "spa_location" },
              { text: "Call the Spa", action: "call_spa" },
              { text: "Chat with Manager", action: "talk_with_manager" },
            ],
        bookingData: {
          ...bookingState,
          timeSlot: selectedSlot.label,
          date: appointmentDate,
          confirmed: true,
        },
      };
    }

    return {
      content:
        `**Booking Confirmed!** 🎈\n\n` +
        `Dear ${customerDisplayName || 'Valued Guest'},\n\n` +
        `📅 **Date:** ${formattedDate}\n` +
        `🕒 **Time:** ${selectedSlot.label}\n` +
        `💆‍♀️ **Service:** ${serviceName}${offerText}\n` +
        `👤 **Therapist:** ${managerName || 'Our Therapist'} will be ready for you!\n` +
        `📍 **Location:** ${locationLink}\n\n` +
        `🌿 Arrive 10 mins early for a welcome herbal tea\n\n` +
        `💬 **Need to reschedule?** Just reply *CHANGE*\n` +
        `❓ **Questions?** Reply *HELP*\n\n` +
        `See you soon, ${customerDisplayName || 'Valued Guest'}! 😊\n\n` +
        `_${businessName} Team_`,
      quickReplies: [
        { text: "Change Time", action: "book_now" },
        { text: "View Location", action: "spa_location" },
        { text: "Call the Spa", action: "call_spa" },
        { text: "Chat with Manager", action: "talk_with_manager" },
      ],
      bookingData: {
        ...bookingState,
        timeSlot: selectedSlot.label,
        date: appointmentDate,
        confirmed: true,
      },
    };
  }

  // Location details
  if (
    action === "spa_location" ||
    lowerMessage.includes("location") ||
    lowerMessage.includes("address") ||
    lowerMessage.includes("where")
  ) {
    const locationLink = managerDetails?.locationLink || "https://maps.google.com/?q=Spa+Location";
    const businessName = managerDetails?.businessName || "Our Spa";
    const customResponse = autoReplyConfig?.responses?.location;

    if (customResponse?.content) {
      let content = customResponse.content
        .replace(/\{locationLink\}/g, locationLink)
        .replace(/\{businessName\}/g, businessName);

      return {
        content,
        quickReplies: customResponse.quickReplies.length > 0
          ? customResponse.quickReplies
          : [
              { text: "Call the Spa", action: "call_spa" },
              { text: "Book an Appointment", action: "book_now" },
              { text: "Claim Welcome Offer", action: "claim_offer" },
            ],
      };
    }

    return {
      content: `📍 **We're located at:**\n${locationLink}\n\n✨ **Amenities:**\n• Free parking available\n• Garden courtyard access\n• Easy to find location\n\nNeed directions or prefer a call?`,
      quickReplies: [
        { text: "Call the Spa", action: "call_spa" },
        { text: "Book an Appointment", action: "book_now" },
        { text: "Claim Welcome Offer", action: "claim_offer" },
      ],
    };
  }

  // Call SPA / talk to manager
  if (
    action === "call_spa" ||
    lowerMessage.includes("call") ||
    lowerMessage.includes("phone") ||
    lowerMessage.includes("contact")
  ) {
    const phone = managerDetails?.phone || "+91 9125846358";
    const businessName = managerDetails?.businessName || "Our Spa";
    const customResponse = autoReplyConfig?.responses?.callSpa;

    if (customResponse?.content) {
      let content = customResponse.content
        .replace(/\{phone\}/g, phone)
        .replace(/\{businessName\}/g, businessName);

      return {
        content,
        quickReplies: customResponse.quickReplies.length > 0
          ? customResponse.quickReplies
          : [
              { text: "Book an Appointment", action: "book_now" },
              { text: "View Location", action: "spa_location" },
              { text: "Talk with Manager", action: "talk_with_manager" },
            ],
      };
    }

    return {
      content: `📞 **You can reach us directly at:**\n${phone}\n\nI'll also let our manager at ${businessName} know you're expecting a call.\n\nIs there anything else you'd like to arrange?`,
      quickReplies: [
        { text: "Book an Appointment", action: "book_now" },
        { text: "View Location", action: "spa_location" },
        { text: "Talk with Manager", action: "talk_with_manager" },
      ],
    };
  }

  // Thank you
  if (lowerMessage.includes("thank")) {
    const customResponse = autoReplyConfig?.responses?.thankYou;
    if (customResponse?.content) {
      return {
        content: customResponse.content,
        quickReplies: customResponse.quickReplies.length > 0
          ? customResponse.quickReplies
          : [
              { text: "Book an Appointment", action: "book_now" },
              { text: "Claim Welcome Offer", action: "claim_offer" },
              { text: "Call the Spa", action: "call_spa" },
            ],
      };
    }

    return {
      content:
        "You're most welcome! 🌼\n\nWhenever you're ready for a little indulgence, I'm here to help you book it.",
      quickReplies: [
        { text: "Book an Appointment", action: "book_now" },
        { text: "Claim Welcome Offer", action: "claim_offer" },
        { text: "Call the Spa", action: "call_spa" },
      ],
    };
  }

  // Greetings
  if (
    lowerMessage.includes("hello") ||
    lowerMessage.includes("hi") ||
    lowerMessage.includes("hey") ||
    lowerMessage === ""
  ) {
    const customResponse = autoReplyConfig?.responses?.greeting;
    if (customResponse?.content) {
      return {
        content: customResponse.content,
        quickReplies: customResponse.quickReplies.length > 0
          ? customResponse.quickReplies
          : [
              { text: "Claim Welcome Offer", action: "claim_offer" },
              { text: "Services & Pricing", action: "services_pricing" },
              { text: "Book an Appointment", action: "book_now" },
              { text: "Call the Spa", action: "call_spa" },
            ],
      };
    }

    return {
      content:
        "Hello there! 👋 Welcome to our spa sanctuary.\n\nI can help you:\n• Claim our welcome offer\n• Explore services & pricing\n• Reserve your perfect time\n• Get directions or speak with our manager\n\nWhat would you like to do first?",
      quickReplies: [
        { text: "Claim Welcome Offer", action: "claim_offer" },
        { text: "Services & Pricing", action: "services_pricing" },
        { text: "Book an Appointment", action: "book_now" },
        { text: "Call the Spa", action: "call_spa" },
      ],
    };
  }

  // Default response
  const customResponse = autoReplyConfig?.responses?.default;
  if (customResponse?.content) {
    let content = customResponse.content.replace(/\{message\}/g, message || "");
    return {
      content,
      quickReplies: customResponse.quickReplies.length > 0
        ? customResponse.quickReplies
        : [
            { text: "Claim Welcome Offer", action: "claim_offer" },
            { text: "Services & Pricing", action: "services_pricing" },
            { text: "Book an Appointment", action: "book_now" },
            { text: "Call the Spa", action: "call_spa" },
          ],
    };
  }

  return {
    content: `I hear you asking: "${message}"\n\nI'm here to help with anything spa-related—whether it's picking a treatment, reserving your spot, understanding pricing, or speaking with our manager.\n\nLet me know what you need or choose a quick option below to continue.`,
    quickReplies: [
      { text: "Claim Welcome Offer", action: "claim_offer" },
      { text: "Services & Pricing", action: "services_pricing" },
      { text: "Book an Appointment", action: "book_now" },
      { text: "Call the Spa", action: "call_spa" },
    ],
  };
};

// Send welcome message when new customer joins
const sendWelcomeMessage = async (conversationId, managerId, managerName, customerName, managerBusinessName) => {
  try {
    const conversation = await getConversationById(conversationId);
    if (!conversation) {
      console.log("[Welcome] Conversation not found:", conversationId);
      return null;
    }

    // Only send welcome if auto-chat is enabled
    if (!conversation.autoChatEnabled) {
      console.log("[Welcome] Auto-chat disabled for conversation:", conversationId);
      return null;
    }

    // Check if this is a truly new conversation by checking for existing messages
    // (excluding system messages that are created when conversation is first created)
    const existingMessages = await Message.find({
      conversation: conversationId,
      authorType: { $ne: "system" }, // Exclude system messages
    }).limit(1).lean();

    // If there are any non-system messages, this is not a new conversation
    // Don't send welcome message to existing users
    if (existingMessages && existingMessages.length > 0) {
      console.log("[Welcome] Conversation already has messages, skipping welcome:", conversationId);
      return null;
    }

    // Additional check: Verify conversation was created recently (within last 10 minutes)
    // This ensures we don't send welcome to old conversations that somehow have no messages
    const conversationAge = Date.now() - new Date(conversation.createdAt).getTime();
    const TEN_MINUTES = 10 * 60 * 1000; // Increased to 10 minutes for safety
    if (conversationAge > TEN_MINUTES) {
      console.log("[Welcome] Conversation is too old, skipping welcome:", conversationId, "age:", conversationAge);
      return null;
    }

    console.log("[Welcome] Sending welcome message for new conversation:", conversationId);

    // Get manager details for location and phone
    const managerDetails = await getManagerDetails(managerId);
    // Get auto-reply configuration
    const autoReplyConfig = await getAutoReplyConfig(managerId);
    const welcomeData = await getWelcomeMessage(managerName, customerName, managerBusinessName, managerDetails, autoReplyConfig);

    // Create welcome message from manager with quick replies encoded
    let welcomeContent = welcomeData.content;
    if (welcomeData.quickReplies && welcomeData.quickReplies.length > 0) {
      const quickRepliesJson = JSON.stringify(welcomeData.quickReplies);
      welcomeContent += `\n<!-- QUICK_REPLIES:${quickRepliesJson} -->`;
    }

    const welcomeMessage = await createMessage({
      conversationId: conversationId.toString(),
      authorType: "manager",
      authorId: managerId.toString(),
      content: welcomeContent,
    });

    console.log("[Welcome] Welcome message created successfully:", welcomeMessage._id);
    return welcomeMessage;
  } catch (error) {
    console.error("[Welcome] Failed to send welcome message:", error);
    return null;
  }
};

// Process customer message and send auto-response
const processCustomerMessage = async (conversationId, customerMessage, action = null) => {
  try {
    // Optimized: Fetch conversation with only needed fields, no populate (we'll fetch manager separately if needed)
    const conversation = await Conversation.findById(conversationId)
      .select("manager customer autoChatEnabled autoChatMessageCount metadata")
      .lean();
    if (!conversation) return null;

    // Check if auto-chat is enabled
    if (!conversation.autoChatEnabled) return null;

    // Get manager details - handle both populated and non-populated cases
    const managerId = conversation.manager;
    
    // Parallelize independent queries
    const [managerDetails, autoReplyConfig] = await Promise.all([
      getManagerDetails(managerId),
      getAutoReplyConfig(managerId), // This is now cached, so very fast
    ]);

    // Check if we've reached max messages
    if (conversation.autoChatMessageCount >= MAX_AUTO_CHAT_MESSAGES) {
      // Check if we've already sent the "talk with manager" message (optimized query)
      const recentManagerMessages = await Message.find({
        conversation: conversationId,
        authorType: "manager",
      })
        .sort({ createdAt: -1 })
        .limit(3)
        .select("content")
        .lean();

      const talkWithManagerSent = recentManagerMessages.some(
        (msg) =>
          msg.content &&
          msg.content.includes("Would you like to speak directly with our manager"),
      );

      // If we haven't sent it yet, send it once
      if (!talkWithManagerSent) {
        const talkWithManagerReply = { text: "Talk with my manager", action: "talk_with_manager" };
        const quickRepliesJson = JSON.stringify([talkWithManagerReply]);
        const connectMessageContent =
          "I've answered your initial questions! Would you like to speak directly with our manager? They can provide more personalized assistance. 😊\n<!-- QUICK_REPLIES:" +
          quickRepliesJson +
          " -->";

        const connectMessage = await createMessage({
          conversationId: conversationId.toString(),
          authorType: "manager",
          authorId: managerId?.toString(),
          content: connectMessageContent,
        });

        return connectMessage;
      }

      // If already sent, don't respond anymore - let manager handle it
      return null;
    }

    // Get customer name from conversation metadata (already loaded)
    const customerName = conversation?.metadata?.customerName || null;

    // Get bot response (now async and receives conversation and managerDetails)
    const botResponse = await getBotResponse(
      customerMessage,
      action,
      conversation.autoChatMessageCount,
      conversation,
      managerDetails,
      customerName,
      autoReplyConfig,
    );

    // If customer wants to talk with manager, disable auto-chat
    if (botResponse.disableAutoChat) {
      await Conversation.findByIdAndUpdate(conversationId, { autoChatEnabled: false });

      const responseMessage = await createMessage({
        conversationId: conversationId.toString(),
        authorType: "manager",
        authorId: managerId?.toString(),
        content: botResponse.content,
      });

      return responseMessage;
    }

    // Save booking state and increment message count in parallel
    const updatePromises = [];
    if (botResponse.bookingData) {
      updatePromises.push(saveBookingState(conversationId, botResponse.bookingData));
    }
    updatePromises.push(
      Conversation.findByIdAndUpdate(conversationId, { $inc: { autoChatMessageCount: 1 } })
    );
    await Promise.all(updatePromises);

    // Create auto-response message from manager
    // Encode quick replies in content with special marker
    let messageContent = botResponse.content;
    if (botResponse.quickReplies && botResponse.quickReplies.length > 0) {
      const quickRepliesJson = JSON.stringify(botResponse.quickReplies);
      messageContent += `\n<!-- QUICK_REPLIES:${quickRepliesJson} -->`;
    }

    // After 10 messages, add "Talk with manager" option
    if (conversation.autoChatMessageCount >= MAX_AUTO_CHAT_MESSAGES - 1) {
      const talkWithManagerReply = { text: "Talk with my manager", action: "talk_with_manager" };
      const existingReplies = botResponse.quickReplies || [];
      const allReplies = [...existingReplies, talkWithManagerReply];
      const quickRepliesJson = JSON.stringify(allReplies);
      messageContent = botResponse.content + `\n<!-- QUICK_REPLIES:${quickRepliesJson} -->`;
    }

    const responseMessage = await createMessage({
      conversationId: conversationId.toString(),
      authorType: "manager",
      authorId: managerId?.toString(),
      content: messageContent,
    });

    return responseMessage;
  } catch (error) {
    console.error("Failed to process customer message:", error);
    return null;
  }
};

// Disable auto-chat for a conversation
const disableAutoChat = async (conversationId) => {
  try {
    const conversation = await Conversation.findByIdAndUpdate(
      conversationId,
      { autoChatEnabled: false },
      { new: true },
    );
    return conversation;
  } catch (error) {
    console.error("Failed to disable auto-chat:", error);
    return null;
  }
};

module.exports = {
  sendWelcomeMessage,
  processCustomerMessage,
  disableAutoChat,
  getBotResponse,
  getAutoReplyConfig,
  invalidateAutoReplyConfigCache,
  MAX_AUTO_CHAT_MESSAGES,
};
