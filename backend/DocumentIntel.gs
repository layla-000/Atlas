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

  // Flight first
  if (
    target.includes("turkish airlines") ||
    target.includes("flight") ||
    target.includes("boarding") ||
    target.includes("terminal") ||
    target.includes("pnr") ||
    target.includes("e-ticket") ||
    target.includes("passenger") ||
    target.includes("departure airport") ||
    target.includes("arrival airport")
  ) {
    return "flight_booking";
  }

  // Train
  if (
    target.includes("train") ||
    target.includes("rail") ||
    target.includes("station") ||
    target.includes("platform") ||
    target.includes("carriage") ||
    target.includes("coach")
  ) {
    return "train_ticket";
  }

  // Bus
  if (
    target.includes("bus") ||
    target.includes("otogar") ||
    target.includes("departure terminal") ||
    target.includes("arrival terminal")
  ) {
    return "bus_ticket";
  }

  // Tour / activity
  if (
    target.includes("tour") ||
    target.includes("activity") ||
    target.includes("meeting point") ||
    target.includes("pickup point") ||
    target.includes("pickup")
  ) {
    return "tour_booking";
  }

  // Hotel last, with stronger hotel-specific signals
  const hasHotelWord =
    target.includes("hotel") ||
    target.includes("room type") ||
    target.includes("check-in") ||
    target.includes("check in") ||
    target.includes("property contact number") ||
    target.includes("number of rooms");

  const hasStayDates =
    target.includes("arrival") && target.includes("departure");

  if (hasHotelWord || hasStayDates) {
    return "hotel_booking";
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
      /Property\s*:\s*([^\n\r]+)/i,
      /^Hotel\s+([^\n\r]+)/im
    ]),
    roomType: matchFirst_(text, [
      /Room Type\s*:\s*([^\n\r]+)/i
    ]),
    checkIn: matchFirst_(text, [
      /Arrival\s*:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i,
      /Check[- ]?in\s*:\s*([^\n\r]+)/i
    ]),
    checkOut: matchFirst_(text, [
      /Departure\s*:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i,
      /Check[- ]?out\s*:\s*([^\n\r]+)/i
    ]),
    guestName: matchFirst_(text, [
      /Guest List\s*:\s*([^\n\r]+)/i,
      /Client\s*:\s*([^\n\r]+)/i
    ]),
    bookingReference: matchFirst_(text, [
      /Booking ID\s*:\s*([^\n\r]+)/i,
      /Reference # for Guest\s*:\s*([^\n\r]+)/i,
      /Booking Reference No\s*:\s*([^\n\r]+)/i
    ]),
    address: matchFirst_(text, [
      /Address\s*:\s*([^\n\r]+)/i
    ]),
    cancellationPolicy: matchFirst_(text, [
      /Cancellation Policy:\s*([\s\S]*?)(?:Benefits Included|Arrival\s*:|Payment Method|Booked And Payable Through|Remarks\s*:|Guest List|Notes|$)/i
    ]),
    confidence: 0.82
  };
}
function extractFlightBooking_(text, parsed) {
  return {
    type: "flight_booking",
    sourceFileName: parsed.fileName,
    airline: matchFirst_(text, [
      /Turkish Airlines/i,
      /([A-Za-z ]+Airlines)/i,
      /Airline\s*:\s*(.+)/i
    ]),
    flightNumber: matchFirst_(text, [
      /\b([A-Z]{2}\s?\d{2,4})\b/,
      /Flight\s*(?:No|Number)?\s*:\s*(.+)/i
    ]),
    departurePlace: matchFirst_(text, [
      /From\s*:\s*(.+)/i,
      /Departure Airport\s*:\s*(.+)/i,
      /Departure\s*:\s*(.+)/i
    ]),
    arrivalPlace: matchFirst_(text, [
      /To\s*:\s*(.+)/i,
      /Arrival Airport\s*:\s*(.+)/i,
      /Arrival\s*:\s*(.+)/i
    ]),
    departureTime: matchFirst_(text, [
      /Departure Time\s*:\s*(.+)/i,
      /Departure Date\/Time\s*:\s*(.+)/i
    ]),
    arrivalTime: matchFirst_(text, [
      /Arrival Time\s*:\s*(.+)/i,
      /Arrival Date\/Time\s*:\s*(.+)/i
    ]),
    terminal: matchFirst_(text, [
      /Terminal\s*:\s*(.+)/i
    ]),
    bookingReference: matchFirst_(text, [
      /PNR\s*:\s*(.+)/i,
      /Booking Reference\s*:\s*(.+)/i,
      /Reservation Code\s*:\s*(.+)/i
    ]),
    confidence: 0.75
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