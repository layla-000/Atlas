function analyzeTravelDocument(parsed) {
  const text = parsed.extractedText || "";
  const fileName = parsed.fileName || "";

  const documentType = classifyTravelDocument_(text, fileName);
  const travelData = extractTravelDataByType_(documentType, text, parsed);

  return {
    analyzedAt: new Date().toISOString(),
    documentType: documentType,
    confidence: travelData.confidence || 0.5,
    travelData: travelData
  };
}

function classifyTravelDocument_(text, fileName) {
  const target = (fileName + "\n" + text).toLowerCase();

  if (
    target.includes("hotel") ||
    target.includes("room type") ||
    target.includes("check-in") ||
    target.includes("check in") ||
    target.includes("arrival") && target.includes("departure") && target.includes("number of rooms")
  ) {
    return "hotel_booking";
  }

  if (
    target.includes("flight") ||
    target.includes("airlines") ||
    target.includes("boarding") ||
    target.includes("terminal") ||
    target.includes("departure airport") ||
    target.includes("arrival airport")
  ) {
    return "flight_booking";
  }

  if (
    target.includes("tour") ||
    target.includes("activity") ||
    target.includes("meeting point") ||
    target.includes("voucher") ||
    target.includes("pickup")
  ) {
    return "tour_booking";
  }

  if (
    target.includes("train") ||
    target.includes("rail") ||
    target.includes("station") ||
    target.includes("coach") ||
    target.includes("platform")
  ) {
    return "train_ticket";
  }

  if (
    target.includes("bus") ||
    target.includes("coach") ||
    target.includes("terminal") ||
    target.includes("seat")
  ) {
    return "bus_ticket";
  }

  return "unknown_document";
}

function extractTravelDataByType_(documentType, text, parsed) {
  if (documentType === "hotel_booking") {
    return extractHotelBooking_(text, parsed);
  }

  if (documentType === "flight_booking") {
    return extractFlightBooking_(text, parsed);
  }

  if (documentType === "tour_booking") {
    return extractTourBooking_(text, parsed);
  }

  if (documentType === "train_ticket") {
    return extractTrainTicket_(text, parsed);
  }

  if (documentType === "bus_ticket") {
    return extractBusTicket_(text, parsed);
  }

  return {
    type: "unknown_document",
    sourceFileName: parsed.fileName,
    confidence: 0.2
  };
}

function extractHotelBooking_(text, parsed) {
  return {
    type: "hotel_booking",
    sourceFileName: parsed.fileName,
    hotelName: matchFirst_(text, [
      /Hotel\s+(.+)/i,
      /Property\s*:\s*(.+)/i
    ]),
    roomType: matchFirst_(text, [/Room Type\s*:\s*(.+)/i]),
    checkIn: matchFirst_(text, [/Arrival\s*:\s*(.+)/i, /Check[- ]?in\s*:\s*(.+)/i]),
    checkOut: matchFirst_(text, [/Departure\s*:\s*(.+)/i, /Check[- ]?out\s*:\s*(.+)/i]),
    guestName: matchFirst_(text, [/Client\s*:\s*(.+)/i, /Guest List\s*:\s*(.+)/i]),
    bookingReference: matchFirst_(text, [/Booking Reference No\s*:\s*(.+)/i, /Reference # for Guest\s*:\s*(.+)/i]),
    cancellationPolicy: matchFirst_(text, [/Cancellation Policy\s*:\s*([\s\S]{0,300})/i]),
    confidence: 0.75
  };
}

function extractFlightBooking_(text, parsed) {
  return {
    type: "flight_booking",
    sourceFileName: parsed.fileName,
    airline: matchFirst_(text, [/Airline\s*:\s*(.+)/i, /([A-Za-z ]+Airlines)/i]),
    flightNumber: matchFirst_(text, [/Flight\s*(?:No|Number)?\s*:\s*(.+)/i, /\b([A-Z]{2}\s?\d{2,4})\b/]),
    departurePlace: matchFirst_(text, [/From\s*:\s*(.+)/i, /Departure\s*:\s*(.+)/i]),
    arrivalPlace: matchFirst_(text, [/To\s*:\s*(.+)/i, /Arrival\s*:\s*(.+)/i]),
    departureTime: matchFirst_(text, [/Departure Time\s*:\s*(.+)/i]),
    arrivalTime: matchFirst_(text, [/Arrival Time\s*:\s*(.+)/i]),
    terminal: matchFirst_(text, [/Terminal\s*:\s*(.+)/i]),
    bookingReference: matchFirst_(text, [/Booking Reference\s*:\s*(.+)/i, /PNR\s*:\s*(.+)/i]),
    confidence: 0.65
  };
}

function extractTourBooking_(text, parsed) {
  return {
    type: "tour_booking",
    sourceFileName: parsed.fileName,
    tourName: matchFirst_(text, [/Tour\s*:\s*(.+)/i, /Activity\s*:\s*(.+)/i]),
    date: matchFirst_(text, [/Date\s*:\s*(.+)/i]),
    startTime: matchFirst_(text, [/Start Time\s*:\s*(.+)/i, /Time\s*:\s*(.+)/i]),
    meetingPoint: matchFirst_(text, [/Meeting Point\s*:\s*(.+)/i, /Pickup Point\s*:\s*(.+)/i]),
    voucherNumber: matchFirst_(text, [/Voucher\s*(?:No|Number)?\s*:\s*(.+)/i]),
    notes: matchFirst_(text, [/Important Information\s*:\s*([\s\S]{0,300})/i]),
    confidence: 0.6
  };
}

function extractTrainTicket_(text, parsed) {
  return {
    type: "train_ticket",
    sourceFileName: parsed.fileName,
    provider: matchFirst_(text, [/Train Operator\s*:\s*(.+)/i, /Railway\s*:\s*(.+)/i]),
    trainNumber: matchFirst_(text, [/Train\s*(?:No|Number)?\s*:\s*(.+)/i]),
    departurePlace: matchFirst_(text, [/From\s*:\s*(.+)/i, /Departure Station\s*:\s*(.+)/i]),
    arrivalPlace: matchFirst_(text, [/To\s*:\s*(.+)/i, /Arrival Station\s*:\s*(.+)/i]),
    departureTime: matchFirst_(text, [/Departure Time\s*:\s*(.+)/i]),
    arrivalTime: matchFirst_(text, [/Arrival Time\s*:\s*(.+)/i]),
    seat: matchFirst_(text, [/Seat\s*:\s*(.+)/i]),
    bookingReference: matchFirst_(text, [/Booking Reference\s*:\s*(.+)/i, /PNR\s*:\s*(.+)/i]),
    confidence: 0.6
  };
}

function extractBusTicket_(text, parsed) {
  return {
    type: "bus_ticket",
    sourceFileName: parsed.fileName,
    provider: matchFirst_(text, [/Bus Company\s*:\s*(.+)/i, /Operator\s*:\s*(.+)/i]),
    routeName: matchFirst_(text, [/Route\s*:\s*(.+)/i]),
    departurePlace: matchFirst_(text, [/From\s*:\s*(.+)/i, /Departure Terminal\s*:\s*(.+)/i]),
    arrivalPlace: matchFirst_(text, [/To\s*:\s*(.+)/i, /Arrival Terminal\s*:\s*(.+)/i]),
    departureTime: matchFirst_(text, [/Departure Time\s*:\s*(.+)/i]),
    arrivalTime: matchFirst_(text, [/Arrival Time\s*:\s*(.+)/i]),
    seat: matchFirst_(text, [/Seat\s*:\s*(.+)/i]),
    bookingReference: matchFirst_(text, [/Booking Reference\s*:\s*(.+)/i, /PNR\s*:\s*(.+)/i]),
    confidence: 0.6
  };
}

function matchFirst_(text, patterns) {
  for (let i = 0; i < patterns.length; i++) {
    const match = text.match(patterns[i]);
    if (match && match[1]) {
      return String(match[1]).trim();
    }
  }

  return "";
}