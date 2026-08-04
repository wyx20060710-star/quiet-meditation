export function localDateKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateFromLocalKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year!, month! - 1, day!, 12, 0, 0, 0);
}

export function localDateSequence(end: Date, days: number): string[] {
  const cursor = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 12);
  const keys: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(cursor);
    date.setDate(cursor.getDate() - offset);
    keys.push(localDateKey(date));
  }
  return keys;
}
