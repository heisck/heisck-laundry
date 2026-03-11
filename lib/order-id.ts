function toRoomCode(roomNumber: string): string {
  const cleaned = roomNumber.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned.length > 0 ? cleaned : "ROOM";
}

function toNameCode(customerName: string): string {
  const cleaned = customerName.toUpperCase().replace(/[^A-Z]/g, "");
  return cleaned.slice(0, 3).padEnd(3, "X");
}

export function buildOrderPrefix(
  roomNumber: string,
  customerName: string,
): string {
  return `${toRoomCode(roomNumber)}${toNameCode(customerName)}`;
}

export function buildOrderId(prefix: string, sequence: number): string {
  return `${prefix}${String(sequence).padStart(2, "0")}`;
}
