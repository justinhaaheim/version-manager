import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';

dayjs.extend(duration);

/**************************************************
 * General utils
 **************************************************/

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
 * Project specific utils
 **************************************************/

/**
 * Formats a Date object into a localized date string (Mar 18, 2025 format)
 */
export const getFormattedDate = (date: Date): string => {
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

// `M/D` if this year, otherwise `M/D/Y`
export function getFormattedDateNumericYearOptional(date: Date): string {
  const today = new Date();
  const isSameYear = date.getFullYear() === today.getFullYear();

  if (isSameYear) {
    return date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'numeric',
    });
  }

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
}

// `DAY, M/D` if this year, otherwise `DAY, M/D/Y`
export function getFormattedDateNumericYearOptionalWithDayOfWeek(
  date: Date,
): string {
  const today = new Date();
  const isSameYear = date.getFullYear() === today.getFullYear();

  if (isSameYear) {
    return date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'numeric',
      weekday: 'short',
    });
  }

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'numeric',
    weekday: 'short',
    year: 'numeric',
  });
}

/**
 * Formats a Date object into a time string (7:42PM format)
 */
export const getFormattedTime = (date: Date): string => {
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    hour12: true,
    minute: '2-digit',
  });
};

export function formatDurationTotalDayJs(durationMs: number | null): string {
  if (durationMs == null) {
    return '#:##';
  }

  // Round up to the nearest second
  const durationMsRounded = Math.ceil(durationMs / 1000) * 1000;
  const d = dayjs.duration(durationMsRounded);

  const hours = Math.floor(d.asHours());
  const minutesAndSecondsPadded = d.format('mm:ss');

  if (hours >= 1) {
    return `${hours}:${minutesAndSecondsPadded}`;
  }

  // If there are no hours don't pad the minutes
  return d.format('m:ss');
}

export function formatDurationTotal(durationMs: number | null): string {
  if (durationMs == null) {
    return '#:##';
  }

  // We want to use Math.ceil here. If the duration is 0.5 seconds, we want to show 1 second.
  const totalSeconds = Math.ceil(durationMs / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatDurationPosition(durationMs: number | null): string {
  if (durationMs == null) {
    return '0:00';
  }

  // We want to use Math.floor here for position, so that as we're playing a
  // recording it stays at 0:00 until we've reached a full second
  const totalSeconds = Math.floor(durationMs / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const NUMBER_PADDED_WITH_TENTHS_FORMATTER = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
  minimumIntegerDigits: 2,
});

// TODO: Decide how to round 4.59. Should it be 4.6 or 4.5?
export function formatDurationWithTenths(durationMs: number | null): string {
  if (durationMs == null) {
    return '0:00.0';
  }

  // We want to use Math.floor here for position, so that as we're playing a
  // recording it stays at 0:00 until we've reached a full second
  const totalSeconds = durationMs / 1000;
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;

  return `${mins}:${NUMBER_PADDED_WITH_TENTHS_FORMATTER.format(secs)}`;
}

export function formatDurationPositionWithTenthsWorklet(
  durationMs: number | null,
): string {
  'worklet';
  if (durationMs == null) {
    return '0:00.0';
  }

  const numberPaddedWithTenthsFormatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
    minimumIntegerDigits: 2,
  });

  // We want to use Math.floor here for position, so that as we're playing a
  // recording it stays at 0:00 until we've reached a full second
  const totalSeconds = Math.floor(durationMs / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;

  return `${mins}:${numberPaddedWithTenthsFormatter.format(secs)}`;
}
