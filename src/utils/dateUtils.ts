import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const DEBUG_DATE_PARSING = false;

const AMERICA_LOS_ANGELES_TIMEZONE = 'America/Los_Angeles';
export const DEFAULT_TIMEZONE = AMERICA_LOS_ANGELES_TIMEZONE;

/**************************************************
 * General utils
 **************************************************/

export function getCurrentTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function getDateTimeString(date?: Date): string {
  return dayjs(date).format('YYYY-MM-DD__HH-mm-ss');
}

export function getPrettyDateTimeString(date?: Date): string {
  return dayjs(date).format('MMM D, YYYY h:mma');
}

export function getPrettyDateTimeStringWithTz(date?: Date): string {
  return dayjs(date).format('MMM D, YYYY h:mma Z');
}

export function getPrettyDateTimeStringWithSeconds(date?: Date): string {
  return dayjs(date).format('MMM D, YYYY h:mm:ss a');
}

export function getDateString(date?: Date): string {
  return dayjs(date).format('YYYY-MM-DD');
}

export function getTimePrettyString(date?: Date): string {
  return dayjs(date).format('h:mm a');
}

/**************************************************
 * Comparison utils
 **************************************************/

export function isOverlapping(
  range1: {end: number; start: number},
  range2: {end: number; start: number},
): boolean {
  return range1.start <= range2.end && range1.end >= range2.start;
}

export function isDoseWithinRange(
  dose: {endTime: Date; startTime: Date},
  range: {end: number; start: number},
): boolean {
  return isOverlapping(
    {end: dose.endTime.getTime(), start: dose.startTime.getTime()},
    range,
  );
}

export function isDoseIntersectingTimeMs(
  dose: {endTime: Date; startTime: Date},
  timeMs: number,
): boolean {
  return dose.startTime.getTime() <= timeMs && dose.endTime.getTime() >= timeMs;
}

export function getLatestDoseEndTimeMs(
  doses: {endTime: Date; startTime: Date}[],
): number {
  return Math.max(...doses.map((dose) => dose.endTime.getTime()));
}

export function getLatestDoseStartTimeMs(
  doses: {endTime: Date; startTime: Date}[],
): number {
  return Math.max(...doses.map((dose) => dose.startTime.getTime()));
}

/**************************************************
 * Date parsing utils
 **************************************************/

export function parseDateToNativeDate(
  dateString?: string,
  tz: string = AMERICA_LOS_ANGELES_TIMEZONE,
): Date | null {
  try {
    if (DEBUG_DATE_PARSING) {
      console.debug('[parseDateToNativeDate] Starting parse', {
        dateString,
        dateStringType: typeof dateString,
        tz,
      });
    }

    if (!dateString) {
      if (DEBUG_DATE_PARSING) {
        console.debug(
          '[parseDateToNativeDate] No dateString provided, returning null',
        );
      }
      return null;
    }

    // Try parsing with different formats
    const formats = [
      'M/D/YYYY H:mm:ss', // Format used in test data
      'M/D/YYYY H:mm',
      'YYYY-MM-DDTHH:mm:ss', // ISO format
      'YYYY-MM-DD HH:mm:ss',
      'YYYY-MM-DD H:m:s',
    ];

    let d: Date | null = null;

    // Try each format
    for (const format of formats) {
      try {
        const parsed = dayjs.tz(dateString, format, tz);
        if (DEBUG_DATE_PARSING) {
          console.debug('[parseDateToNativeDate] Trying format', {
            format,
            isValid: parsed.isValid(),
            parsedValue: parsed.isValid() ? parsed.toISOString() : 'invalid',
          });
        }
        if (parsed.isValid()) {
          d = parsed.toDate();
          if (DEBUG_DATE_PARSING) {
            console.debug(
              '[parseDateToNativeDate] Successfully parsed with format',
              format,
            );
          }
          break;
        }
      } catch (formatError) {
        if (DEBUG_DATE_PARSING) {
          console.debug(
            '[parseDateToNativeDate] Error with format',
            format,
            formatError,
          );
        }
      }
    }

    // If no format worked, try without format (dayjs default parsing)
    if (!d) {
      if (DEBUG_DATE_PARSING) {
        console.debug(
          '[parseDateToNativeDate] No format worked, trying default parsing',
        );
      }
      try {
        const parsed = dayjs.tz(dateString, tz);
        if (parsed.isValid()) {
          d = parsed.toDate();
          if (DEBUG_DATE_PARSING) {
            console.debug(
              '[parseDateToNativeDate] Successfully parsed with default parser',
            );
          }
        } else if (DEBUG_DATE_PARSING) {
          console.debug('[parseDateToNativeDate] Default parsing also failed');
        }
      } catch (defaultError) {
        if (DEBUG_DATE_PARSING) {
          console.debug(
            '[parseDateToNativeDate] Error with default parsing',
            defaultError,
          );
        }
      }
    }

    const isValid = d && !isNaN(d.valueOf());

    if (DEBUG_DATE_PARSING) {
      console.debug('[parseDateToNativeDate] Final result', {
        dateValue: d?.valueOf(),
        inputString: dateString,
        isValid,
        parsedDate: isValid && d ? d.toISOString() : null,
      });
    }

    return isValid ? d : null;
  } catch (error) {
    if (DEBUG_DATE_PARSING) {
      console.error(
        '[parseDateToNativeDate] Unexpected error during date parsing',
        {
          dateString,
          error,
          tz,
        },
      );
    }
    return null;
  }
}

export function parseAndGetTimeSinceValue(dateString?: string): number | null {
  const d = parseDateToNativeDate(dateString);
  if (d == null) {
    return null;
  }
  return Date.now() - d.valueOf();
}

/**************************************************
 * String output
 **************************************************/

type GetDurationStringOptions = {
  alwaysShowSign?: boolean;
  compact?: boolean;
};

export function getDurationString(
  durationMs: number,
  {compact, alwaysShowSign}: GetDurationStringOptions = {
    alwaysShowSign: false,
    compact: false,
  },
): string {
  const sign = alwaysShowSign
    ? durationMs <= 0
      ? '-'
      : '+'
    : durationMs < 0
      ? '-'
      : '';

  // Treat this as a positive duration, and add the sign at the end
  const durationMsAbs = Math.abs(durationMs);
  const durationMinutes = Math.floor(durationMsAbs / 1000 / 60);

  // Math.abs allows us to handle negative durations
  if (Math.abs(durationMinutes) < 60) {
    return `${sign}${durationMinutes}m`;
  }
  const durationHours = Math.floor(durationMinutes / 60);

  const separator = compact ? '' : ' ';

  // If the duration is negative we want to show the absolute value of the minutes
  // The sign will be on durationHours
  return `${sign}${durationHours}h${separator}${durationMinutes % 60}m`;
}

export function getDurationStringWithSecondsBelow60(
  durationMs: number,
): string {
  const durationSeconds = Math.floor(durationMs / 1000);
  if (durationSeconds < 60) {
    return `${durationSeconds}s`;
  }
  const durationMinutes = Math.floor(durationMs / 1000 / 60);
  if (durationMinutes < 60) {
    return `${durationMinutes}m`;
  }
  const durationHours = Math.floor(durationMinutes / 60);
  return `${durationHours}h ${durationMinutes % 60}m`;
}
