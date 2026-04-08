import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

import type { VideoConference } from "../../../lib/types";
import { AvatarCircle } from "./AvatarCircle";

const CALENDAR_PAGE_DAYS = 14;

type Props = {
  header?: ReactNode;
  conferences: VideoConference[];
  activeConferenceId: string | null;
  currentUsername: string;
  normalizedSearch: string;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onOpenConference: (conferenceId: string) => void;
  formatConferenceListPreview: (conference: VideoConference, currentUsername: string) => string;
  formatConferenceTileTime: (value: string) => string;
  formatConferenceSchedule: (value: string) => string;
  formatMemberCount: (count: number) => string;
};

type CalendarDaySection = {
  conferences: VideoConference[];
  date: Date;
  key: string;
};

export function ConferenceCalendarPanel({
  header,
  conferences,
  activeConferenceId,
  currentUsername,
  normalizedSearch,
  scrollContainerRef,
  onOpenConference,
  formatConferenceListPreview,
  formatConferenceTileTime,
  formatConferenceSchedule,
  formatMemberCount,
}: Props) {
  const startDayRef = useRef(startOfDay(new Date()));
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [visibleDayCount, setVisibleDayCount] = useState(CALENDAR_PAGE_DAYS);

  const upcomingConferences = useMemo(() => {
    const calendarStart = startDayRef.current.getTime();

    return conferences
      .filter((conference) => !conference.endedAt)
      .filter((conference) => startOfDay(new Date(conference.scheduledAt)).getTime() >= calendarStart)
      .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt));
  }, [conferences]);

  const maxVisibleDayCount = useMemo(() => {
    const lastConference = upcomingConferences[upcomingConferences.length - 1];
    if (!lastConference) {
      return CALENDAR_PAGE_DAYS;
    }

    const lastConferenceDay = startOfDay(new Date(lastConference.scheduledAt));
    return (
      differenceInDays(startDayRef.current, lastConferenceDay) + CALENDAR_PAGE_DAYS + 1
    );
  }, [upcomingConferences]);

  useEffect(() => {
    setVisibleDayCount((current) => Math.min(Math.max(current, CALENDAR_PAGE_DAYS), maxVisibleDayCount));
  }, [maxVisibleDayCount]);

  useEffect(() => {
    const scrollRoot = scrollContainerRef.current;
    const sentinel = sentinelRef.current;
    if (!scrollRoot || !sentinel || visibleDayCount >= maxVisibleDayCount) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }

        setVisibleDayCount((current) => Math.min(current + CALENDAR_PAGE_DAYS, maxVisibleDayCount));
      },
      {
        root: scrollRoot,
        rootMargin: "0px 0px 280px 0px",
      },
    );

    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [maxVisibleDayCount, scrollContainerRef, visibleDayCount]);

  const calendarSections = useMemo(() => {
    const conferencesByDay = new Map<string, VideoConference[]>();
    upcomingConferences.forEach((conference) => {
      const dayKey = toLocalDayKey(new Date(conference.scheduledAt));
      const currentDayConferences = conferencesByDay.get(dayKey) ?? [];
      currentDayConferences.push(conference);
      conferencesByDay.set(dayKey, currentDayConferences);
    });

    return Array.from({
      length: Math.min(visibleDayCount, maxVisibleDayCount),
    }, (_, index) => {
      const date = addDays(startDayRef.current, index);
      const key = toLocalDayKey(date);
      return {
        conferences: conferencesByDay.get(key) ?? [],
        date,
        key,
      } satisfies CalendarDaySection;
    });
  }, [maxVisibleDayCount, upcomingConferences, visibleDayCount]);

  if (upcomingConferences.length === 0) {
    return (
      <div className="conference-calendar">
        {header}
        <div className="empty-list conference-calendar-empty">
          {normalizedSearch ? "По этому фильтру запланированных встреч нет." : "На ближайшее время встреч нет."}
        </div>
      </div>
    );
  }

  return (
    <div className="conference-calendar">
      {header}

      {calendarSections.map((section) => (
        <section key={section.key} className="conference-calendar-day">
          <header className="conference-calendar-day-header">
            <div className="conference-calendar-day-copy">
              <strong>{formatCalendarDayLabel(section.date)}</strong>
              <span>{formatCalendarDaySecondaryLabel(section.date)}</span>
            </div>
            <span className="conference-calendar-day-count">
              {section.conferences.length === 0
                ? "Свободно"
                : formatConferenceCount(section.conferences.length)}
            </span>
          </header>

          {section.conferences.length === 0 ? (
            <div className="conference-calendar-day-empty">Запланированных встреч нет.</div>
          ) : (
            <div className="conference-calendar-day-list">
              {section.conferences.map((conference) => {
                const preview = formatConferenceListPreview(conference, currentUsername);
                const statusLabel = describeCalendarConferenceStatus(conference);
                return (
                  <button
                    type="button"
                    key={conference.id}
                    className={
                      conference.id === activeConferenceId
                        ? "conference-calendar-event is-active"
                        : "conference-calendar-event"
                    }
                    onClick={() => onOpenConference(conference.id)}
                  >
                    <span className="conference-calendar-event-time">
                      {formatConferenceTileTime(conference.scheduledAt)}
                    </span>
                    <AvatarCircle
                      className="avatar conference-calendar-event-avatar"
                      name={conference.title}
                      badge="VC"
                    />
                    <div className="conference-calendar-event-copy">
                      <div className="conference-calendar-event-head">
                        <strong>{conference.title}</strong>
                        <span className="conference-calendar-event-status">{statusLabel}</span>
                      </div>
                      <div className="conference-calendar-event-meta">
                        <span>{formatMemberCount(conference.participants.length)}</span>
                        <span className="conference-calendar-event-separator" />
                        <span>{formatConferenceSchedule(conference.scheduledAt)}</span>
                      </div>
                      <p>{preview || "Участники будут видны после приглашения."}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      ))}

      {visibleDayCount < maxVisibleDayCount ? (
        <div ref={sentinelRef} className="conference-calendar-load-more">
          Прокрутите дальше, чтобы загрузить ещё две недели расписания.
        </div>
      ) : null}
    </div>
  );
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return startOfDay(next);
}

function differenceInDays(start: Date, end: Date) {
  return Math.max(0, Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86_400_000));
}

function toLocalDayKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCalendarDayLabel(value: Date) {
  const now = startOfDay(new Date());
  const target = startOfDay(value);
  const diff = differenceInDays(now, target);
  if (diff === 0) {
    return "Сегодня";
  }

  if (diff === 1) {
    return "Завтра";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
  }).format(value);
}

function formatCalendarDaySecondaryLabel(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(value);
}

function formatConferenceCount(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return `${count} встреча`;
  }

  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) {
    return `${count} встречи`;
  }

  return `${count} встреч`;
}

function describeCalendarConferenceStatus(conference: VideoConference) {
  if (conference.startedAt) {
    return "Идет";
  }

  if (conference.roomName || conference.activatedAt) {
    return "Скоро";
  }

  return "Запланирована";
}
