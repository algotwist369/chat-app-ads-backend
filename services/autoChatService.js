const { Message, Conversation, Manager, AutoReply } = require("../models");
const { createMessage } = require("./messageService");
const { getConversationById } = require("./conversationService");

const MAX_AUTO_CHAT_MESSAGES = 25;

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
  { label: "8:00 AM - 10:00 AM", action: "slot_early_morning" },
  { label: "10:00 AM - 12:00 PM", action: "slot_morning" },
  { label: "12:00 PM - 2:00 PM", action: "slot_midday" },
  { label: "2:00 PM - 4:00 PM", action: "slot_afternoon" },
  { label: "4:00 PM - 6:00 PM", action: "slot_evening" },
  { label: "6:00 PM - 8:00 PM", action: "slot_late_evening" },
  { label: "8:00 PM - 10:00 PM", action: "slot_night" },
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

// Helper to format date for display (short format)
const formatDateShort = (date) => {
  if (!date) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);
  
  const diffDays = Math.round((compareDate - today) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return today.toLocaleDateString("en-IN", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }
  if (diffDays === 1) {
    return compareDate.toLocaleDateString("en-IN", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }
  
  return compareDate.toLocaleDateString("en-IN", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

// Helper to generate date options (today, tomorrow, and next 5 days)
const generateDateOptions = () => {
  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Today
  const todayLabel = `Today (${today.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" })})`;
  dates.push({
    label: todayLabel,
    action: "date_today",
    date: new Date(today),
  });
  
  // Tomorrow
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowLabel = `Tomorrow (${tomorrow.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" })})`;
  dates.push({
    label: tomorrowLabel,
    action: "date_tomorrow",
    date: new Date(tomorrow),
  });
  
  // Next 5 days
  for (let i = 2; i <= 6; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    dates.push({
      label: formatDate(date),
      action: `date_${i}`,
      date: new Date(date),
    });
  }
  
  return dates;
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
    content: `Hello, ${customerName || "Guest"}.\n\nWelcome to ${managerBusinessName || "Our Spa"}. We are delighted to assist you with a serene and personalised spa experience.\n\nFirst-time guests enjoy 10% off or a complimentary 15-minute neck & shoulder ritual with any full treatment.\n\nHow may we assist you today?`,
    quickReplies: [
      { text: "Book Now", action: "book_now" },
      { text: "Services & Pricing", action: "services_pricing" },
      { text: "Complimentary Offer", action: "claim_offer" },
      { text: "Call Spa", action: "call_spa" },
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
      content: "We are connecting you with our manager. They will respond shortly. Please allow a few moments.",
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
        .map((service) => `• ${service.name} - ${service.description}`)
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
              { text: "Call Spa", action: "call_spa" },
            ],
        bookingData: { offerClaimed: true },
      };
    }

    // Default response
    const serviceList = services.slice(0, 3)
      .map((service) => `• ${service.name} - ${service.description}`)
      .join("\n");

    return {
      content:
        "Your welcome offer is confirmed: 10% off or a complimentary 15-minute neck & shoulder ritual with any full treatment.\n\nOur signature treatments:\n" +
        serviceList +
        "\n\nWhich treatment would you prefer?",
      quickReplies: [
        ...services.slice(0, 3).map((service) => ({
          text: service.name,
          action: service.action,
        })),
        { text: "View Treatments", action: "services_pricing" },
        { text: "Call Spa", action: "call_spa" },
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
    const topServiceList = topServices.map((service) => `• ${service.name} - ${service.description}`).join("\n");
    const displayServiceList =
      topServiceList +
      (hasMoreServices ? "\n\n…for more treatments/services, click *More Treatments*." : "");
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
        "Our signature treatments:\n\n" +
        displayServiceList +
        "\n\nEach visit includes a welcome herbal infusion and personalised consultation. Shall we proceed with a reservation?",
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
        content: "You have viewed our complete menu. We would be pleased to recommend a treatment based on your preferences.",
        quickReplies: [
          { text: "Reserve a Slot", action: "book_now" },
          { text: "Complimentary Offer", action: "claim_offer" },
          { text: "Call Spa", action: "call_spa" },
        ],
        bookingData: {
          ...(bookingState || {}),
          servicesFullyBrowsed: true,
          serviceBrowseOffset: services.length,
        },
      };
    }

    const remainingList = remainingServices.map((service) => `• ${service.name} - ${service.description}`).join("\n");
    const nextOffset = currentOffset + remainingServices.length;
    const hasMore = services.length > nextOffset;

    return {
      content:
        "Additional treatments:\n\n" +
        remainingList +
        "\n\nPlease select your preferred treatment and we will arrange a suitable time.",
      quickReplies: [
        ...remainingServices.slice(0, 3).map((service) => ({
          text: service.name,
          action: service.action,
        })),
        { text: "Reserve a Slot", action: "book_now" },
        { text: "Complimentary Offer", action: "claim_offer" },
        { text: "Call Spa", action: "call_spa" },
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
              { text: "Call Spa", action: "call_spa" },
              { text: "Visit Us", action: "spa_location" },
            ],
      };
    }

    return {
      content:
        "Which treatment would you prefer? We will secure a suitable time slot for you.",
      quickReplies: [
        ...services.slice(0, 3).map((service) => ({
          text: service.name,
          action: service.action,
        })),
        { text: "View More Services", action: "services_pricing" },
        { text: "Call Spa", action: "call_spa" },
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
      content: `**${selectedService.name}** (${selectedService.description})\n\nPlease select your preferred time slot.`,
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

  // Time slot selection - now asks for date selection first
  const selectedSlot = timeSlots.find(
    (slot) =>
      action === slot.action || lowerMessage.includes(slot.label.toLowerCase()),
  );

  if (selectedSlot) {
    // Check if date was already selected
    if (bookingState?.date && !bookingState?.confirmed) {
      // Both time slot and date selected - confirm booking immediately
      const serviceName = bookingState?.service || "Your selected treatment";
      const businessName = managerDetails?.businessName || "Our Spa";
      const locationLink = managerDetails?.locationLink || "https://maps.google.com/?q=Spa+Location";
      const phone = managerDetails?.phone || "+91 9876543210";
      const managerName = managerDetails?.managerName || "Our Team";

      const customerDisplayName = customerName ||
        conversation?.metadata?.customerName ||
        conversation?.customer?.name ||
        "Valued Guest";

      let appointmentDate = bookingState.date instanceof Date 
        ? bookingState.date 
        : new Date(bookingState.date);

      if (isNaN(appointmentDate.getTime())) {
        appointmentDate = new Date();
        appointmentDate.setDate(appointmentDate.getDate() + 1);
      }

      const formattedDate = formatDate(appointmentDate);
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

        if (!content.includes("✅") && !content.includes("BOOKING CONFIRMED")) {
          content = `✅ BOOKING CONFIRMED ✅\n\n🎉 ${content}`;
        }

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
          `✅ BOOKING CONFIRMED ✅\n\n` +
          `🎉 Your appointment has been successfully confirmed!\n\n` +
          `Dear ${customerDisplayName || 'Valued Guest'},\n\n` +
          `📅 Date: ${formattedDate}\n` +
          `🕐 Time: ${selectedSlot.label}\n` +
          `💆 Treatment: ${serviceName}${offerText}\n` +
          `📍 Location: ${locationLink}\n\n` +
          `✨ Important Reminders:\n` +
          `• We recommend arriving 10 minutes early to enjoy a complimentary herbal infusion.\n` +
          `• To modify: Reply *CHANGE*\n` +
          `• Questions: Reply *HELP*\n\n` +
          `We look forward to welcoming you!\n\n` +
          `Thank you,\n${businessName} Team`,
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

    // Time slot selected but no date selected yet - ask for date
    const serviceName = bookingState?.service || "Your selected treatment";
    const dateOptions = generateDateOptions();
    
    const customResponse = autoReplyConfig?.responses?.dateSelection;
    if (customResponse?.content) {
      let content = customResponse.content
        .replace(/\{serviceName\}/g, serviceName)
        .replace(/\{time\}/g, selectedSlot.label);
      
      return {
        content,
        quickReplies: customResponse.quickReplies.length > 0
          ? customResponse.quickReplies
          : [
              ...dateOptions.slice(0, 4).map((dateOpt) => ({
                text: dateOpt.label,
                action: dateOpt.action,
              })),
              { text: "Change Time", action: "book_now" },
              { text: "Call the Spa", action: "call_spa" },
            ],
        bookingData: {
          ...(bookingState || {}),
          timeSlot: selectedSlot.label,
        },
      };
    }

    return {
      content: `**${serviceName}**\n**Time:** ${selectedSlot.label}\n\n📅 Please select your preferred date:`,
      quickReplies: [
        ...dateOptions.slice(0, 4).map((dateOpt) => ({
          text: dateOpt.label,
          action: dateOpt.action,
        })),
        { text: "More Dates", action: "date_more" },
        { text: "Change Time", action: "book_now" },
        { text: "Call the Spa", action: "call_spa" },
      ],
      bookingData: {
        ...(bookingState || {}),
        timeSlot: selectedSlot.label,
      },
    };
  }

  // Date selection handling
  if (action?.startsWith("date_") || lowerMessage.includes("today") || lowerMessage.includes("tomorrow")) {
    const dateOptions = generateDateOptions();
    let selectedDateOption = null;

    if (action === "date_today") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      selectedDateOption = dateOptions.find(opt => opt.action === "date_today");
    } else if (action === "date_tomorrow") {
      selectedDateOption = dateOptions.find(opt => opt.action === "date_tomorrow");
    } else if (action?.startsWith("date_") && action !== "date_more") {
      // Handle custom date actions (date_2, date_3, etc.)
      selectedDateOption = dateOptions.find(opt => opt.action === action);
    } else if (lowerMessage.includes("today")) {
      selectedDateOption = dateOptions.find(opt => opt.action === "date_today");
    } else if (lowerMessage.includes("tomorrow")) {
      selectedDateOption = dateOptions.find(opt => opt.action === "date_tomorrow");
    }

    if (selectedDateOption) {
      // Check if time slot was already selected
      if (!bookingState?.timeSlot) {
        // No time slot selected yet, ask for it first
        const serviceName = bookingState?.service || "Your selected treatment";
        return {
          content: `You've selected the date. Now please choose your preferred time slot for **${serviceName}**:`,
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
            date: selectedDateOption.date,
          },
        };
      }

      // Date selected, now confirm booking
      const serviceName = bookingState?.service || "Your selected treatment";
      const timeSlotLabel = bookingState?.timeSlot || "Selected time";
      const appointmentDate = selectedDateOption.date;
      const formattedDate = formatDate(appointmentDate);
      
      // Continue to booking confirmation with selected date
      // (this will be handled by the booking confirmation logic below)
      const businessName = managerDetails?.businessName || "Our Spa";
      const locationLink = managerDetails?.locationLink || "https://maps.google.com/?q=Spa+Location";
      const phone = managerDetails?.phone || "+91 9876543210";
      const managerName = managerDetails?.managerName || "Our Team";

      // Get customer name from conversation metadata or parameter
      const customerDisplayName = customerName ||
        conversation?.metadata?.customerName ||
        conversation?.customer?.name ||
        "Valued Guest";

      // Determine if offer was claimed
      const offerClaimed = bookingState?.offerClaimed === true;
      const offerText = offerClaimed ? " + FREE Neck Massage / 10% OFF" : "";
      
      const customResponse = autoReplyConfig?.responses?.bookingConfirmed;
      
      if (customResponse?.content) {
        let content = customResponse.content
          .replace(/\{customerName\}/g, customerDisplayName || "Valued Guest")
          .replace(/\{date\}/g, formattedDate)
          .replace(/\{time\}/g, timeSlotLabel)
          .replace(/\{serviceName\}/g, serviceName)
          .replace(/\{offerText\}/g, offerText)
          .replace(/\{therapistName\}/g, managerName || "Our Therapist")
          .replace(/\{locationLink\}/g, locationLink)
          .replace(/\{businessName\}/g, businessName);

        // Add highlighting markers for booking confirmation if custom content doesn't already have them
        if (!content.includes("✅") && !content.includes("BOOKING CONFIRMED")) {
          content = `✅ BOOKING CONFIRMED ✅\n\n🎉 ${content}`;
        }

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
            timeSlot: timeSlotLabel,
            date: appointmentDate,
            confirmed: true,
          },
        };
      }

      return {
        content:
          `✅ BOOKING CONFIRMED ✅\n\n` +
          `🎉 Your appointment has been successfully confirmed!\n\n` +
          `Dear ${customerDisplayName || 'Valued Guest'},\n\n` +
          `📅 Date: ${formattedDate}\n` +
          `🕐 Time: ${timeSlotLabel}\n` +
          `💆 Treatment: ${serviceName}${offerText}\n` +
          `📍 Location: ${locationLink}\n\n` +
          `✨ Important Reminders:\n` +
          `• We recommend arriving 10 minutes early to enjoy a complimentary herbal infusion.\n` +
          `• To modify: Reply *CHANGE*\n` +
          `• Questions: Reply *HELP*\n\n` +
          `We look forward to welcoming you!\n\n` +
          `Thank you,\n${businessName} Team`,
        quickReplies: [
          { text: "Change Time", action: "book_now" },
          { text: "View Location", action: "spa_location" },
          { text: "Call the Spa", action: "call_spa" },
          { text: "Chat with Manager", action: "talk_with_manager" },
        ],
        bookingData: {
          ...bookingState,
          timeSlot: timeSlotLabel,
          date: appointmentDate,
          confirmed: true,
        },
      };
    } else if (action === "date_more") {
      // Show more date options
      const dateOptions = generateDateOptions();
      const serviceName = bookingState?.service || "Your selected treatment";
      
      return {
        content: `📅 Additional Date Options:\n\nPlease select your preferred date for **${serviceName}**:`,
        quickReplies: [
          ...dateOptions.slice(4).map((dateOpt) => ({
            text: dateOpt.label,
            action: dateOpt.action,
          })),
          { text: "Change Time", action: "book_now" },
          { text: "Call the Spa", action: "call_spa" },
        ],
        bookingData: {
          ...(bookingState || {}),
        },
      };
    }
  }

  // Booking confirmation (when time slot and date are both selected)
  if (selectedSlot && bookingState?.date && !bookingState?.confirmed) {
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

    // Use the stored date from booking state
    let appointmentDate = bookingState.date instanceof Date 
      ? bookingState.date 
      : new Date(bookingState.date);

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

      // Add highlighting markers for booking confirmation if custom content doesn't already have them
      if (!content.includes("✅") && !content.includes("BOOKING CONFIRMED")) {
        // Prepend confirmation markers to make it more noticeable
        content = `✅ BOOKING CONFIRMED ✅\n\n🎉 ${content}`;
      }

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
        `✅ BOOKING CONFIRMED ✅\n\n` +
        `🎉 Your appointment has been successfully confirmed!\n\n` +
        `Dear ${customerDisplayName || 'Valued Guest'},\n\n` +
        `📅 Date: ${formattedDate}\n` +
        `🕐 Time: ${selectedSlot.label}\n` +
        `💆 Treatment: ${serviceName}${offerText}\n` +
        `📍 Location: ${locationLink}\n\n` +
        `✨ Important Reminders:\n` +
        `• We recommend arriving 10 minutes early to enjoy a complimentary herbal infusion.\n` +
        `• To modify: Reply *CHANGE*\n` +
        `• Questions: Reply *HELP*\n\n` +
        `We look forward to welcoming you!\n\n` +
        `Thank you,\n${businessName} Team`,
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
      content: `Location: ${locationLink}\n\nAmenities:\n• Complimentary parking\n• Garden courtyard\n• Convenient access\n\nMay we assist with directions or arrange a call?`,
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
      content: `Direct line: ${phone}\n\nOur manager at ${businessName} will be notified of your call request.\n\nHow else may we assist you?`,
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
        "You are most welcome. We are at your service whenever you wish to make a reservation.",
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
        "Good day. Welcome to our spa.\n\nWe can assist with:\n• Welcome offer\n• Services & pricing\n• Reservations\n• Directions or manager consultation\n\nHow may we assist you?",
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
    content: `We understand you are inquiring about: "${message}"\n\nWe can assist with treatment selection, reservations, pricing, or connecting you with our manager.\n\nPlease select an option below or specify your requirement.`,
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
      console.log("[AutoChat] Quota reached! Current count:", conversation.autoChatMessageCount, "for conversation:", conversationId);
      
      // Check if we've already sent the quota message (optimized query - check more messages to be sure)
      const recentManagerMessages = await Message.find({
        conversation: conversationId,
        authorType: "manager",
      })
        .sort({ createdAt: -1 })
        .limit(10) // Increased from 3 to 10 to catch quota messages
        .select("content createdAt")
        .lean();

      console.log("[AutoChat] Found", recentManagerMessages.length, "recent manager messages");

      const quotaMessageSent = recentManagerMessages.some(
        (msg) => {
          if (!msg.content) return false;
          const hasQuotaText = msg.content.includes("You have reached your auto reply quota") ||
                               msg.content.includes("auto reply quota");
          if (hasQuotaText) {
            console.log("[AutoChat] Found existing quota message:", msg._id, "created at:", msg.createdAt);
          }
          return hasQuotaText;
        }
      );

      console.log("[AutoChat] Quota message already sent:", quotaMessageSent);

      // If we haven't sent it yet, send it once
      if (!quotaMessageSent) {
        console.log("[AutoChat] Sending quota message now...");
        const phone = managerDetails?.phone || "+91 9125846358";
        const businessName = managerDetails?.businessName || "Our Spa";
        
        // Disable auto-chat after max messages
        await Conversation.findByIdAndUpdate(conversationId, { autoChatEnabled: false });
        console.log("[AutoChat] Disabled auto-chat for conversation:", conversationId);

        const talkWithManagerReply = { text: "Chat with Manager", action: "talk_with_manager" };
        const callDirectlyReply = { text: "Call Directly", action: "call_spa" };
        const quickRepliesJson = JSON.stringify([talkWithManagerReply, callDirectlyReply]);
        
        const connectMessageContent =
          `You have reached your auto reply quota. Now you can chat with our manager or call directly.\n\n` +
          `Call us directly at: ${phone}\n\n` +
          `Our manager at ${businessName} will respond to your messages soon.\n<!-- QUICK_REPLIES:${quickRepliesJson} -->`;

        console.log("[AutoChat] Quota message content with quick replies:", connectMessageContent);
        console.log("[AutoChat] Quick replies JSON:", quickRepliesJson);

        const connectMessage = await createMessage({
          conversationId: conversationId.toString(),
          authorType: "manager",
          authorId: managerId?.toString(),
          content: connectMessageContent,
        });

        console.log("[AutoChat] ✅ Sent quota reached message:", connectMessage._id, "for conversation:", conversationId);
        console.log("[AutoChat] Message content saved:", connectMessage.content?.substring(0, 200));
        console.log("[AutoChat] Has QUICK_REPLIES in saved content:", connectMessage.content?.includes("QUICK_REPLIES"));
        return connectMessage;
      }

      // If already sent, don't respond anymore - let manager handle it
      console.log("[AutoChat] Quota message already sent, skipping...");
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

    // Check if this will be the last auto-reply before reaching the quota limit
    const willBeLastReply = conversation.autoChatMessageCount === MAX_AUTO_CHAT_MESSAGES - 1;
    
    if (willBeLastReply) {
      console.log("[AutoChat] This will be the last auto-reply! Current count:", conversation.autoChatMessageCount, "Max:", MAX_AUTO_CHAT_MESSAGES);
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

    // After reaching max-1 messages (before sending the last auto-reply), add "Chat with Manager" option to the last reply
    if (willBeLastReply) {
      const talkWithManagerReply = { text: "Chat with Manager", action: "talk_with_manager" };
      const callDirectlyReply = { text: "Call Directly", action: "call_spa" };
      const existingReplies = botResponse.quickReplies || [];
      const allReplies = [...existingReplies, talkWithManagerReply, callDirectlyReply];
      const quickRepliesJson = JSON.stringify(allReplies);
      messageContent = botResponse.content + `\n<!-- QUICK_REPLIES:${quickRepliesJson} -->`;
    }

    const responseMessage = await createMessage({
      conversationId: conversationId.toString(),
      authorType: "manager",
      authorId: managerId?.toString(),
      content: messageContent,
    });

    // If this was the last auto-reply before reaching max, immediately send manager connection message
    if (willBeLastReply) {
      const phone = managerDetails?.phone || "+91 9125846358";
      const businessName = managerDetails?.businessName || "Our Spa";
      
      // Disable auto-chat after max messages
      await Conversation.findByIdAndUpdate(conversationId, { autoChatEnabled: false });

      const talkWithManagerReply = { text: "Chat with Manager", action: "talk_with_manager" };
      const callDirectlyReply = { text: "Call Directly", action: "call_spa" };
      const quickRepliesJson = JSON.stringify([talkWithManagerReply, callDirectlyReply]);
      
      const connectMessageContent =
        `You have reached your auto reply quota. Now you can chat with our manager or call directly.\n\n` +
        `Call us directly at: ${phone}\n\n` +
        `Our manager at ${businessName} will respond to your messages soon.\n<!-- QUICK_REPLIES:${quickRepliesJson} -->`;

      console.log("[AutoChat] Quota message content with quick replies (after last reply):", connectMessageContent);
      console.log("[AutoChat] Quick replies JSON:", quickRepliesJson);

      const connectMessage = await createMessage({
        conversationId: conversationId.toString(),
        authorType: "manager",
        authorId: managerId?.toString(),
        content: connectMessageContent,
      });

      console.log("[AutoChat] ✅ Sent quota reached message (after last auto-reply):", connectMessage._id, "and last auto-reply:", responseMessage._id, "for conversation:", conversationId);
      console.log("[AutoChat] Message content saved:", connectMessage.content?.substring(0, 200));
      console.log("[AutoChat] Has QUICK_REPLIES in saved content:", connectMessage.content?.includes("QUICK_REPLIES"));
      
      // Return both messages - controller will handle emitting them separately
      // We'll return the connect message as primary, and the last auto-reply will be sent first via socket
      // Actually, we need to return a structure that allows both to be sent
      // For now, return connect message and emit the last auto-reply separately in controller
      // Store the last auto-reply in responseMessage metadata or return it as a special case
      return { primary: connectMessage, secondary: responseMessage, isTenthReply: true }; // Keep isTenthReply for backward compatibility
    }

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
 