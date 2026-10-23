import { BadRequestException } from '@nestjs/common';

// Optional extension: FAN 0..3, LIGHT 0..100. null preserves legacy ON/OFF.
export function actuatorLevel(type: string, action: string, level: unknown): number | null {
  if (level === undefined || level === null) return null;
  const max = type === 'FAN' ? 3 : type === 'LIGHT' ? 100 : 0;
  if (!max || typeof level !== 'number' || !Number.isInteger(level) || level < 0 || level > max ||
      (action === 'OFF' ? level !== 0 : action !== 'ON' || level === 0)) {
    throw new BadRequestException('level: FAN 0..3, LIGHT 0..100; OFF cần 0, ON cần mức lớn hơn 0.');
  }
  return level;
}
