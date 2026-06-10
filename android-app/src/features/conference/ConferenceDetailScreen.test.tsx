import type {AuthResponse, VideoConference} from '@north/shared';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Linking, Share} from 'react-native';
import {API_URL} from '../../config';
import {ConferenceDetailScreen} from './ConferenceDetailScreen';

const openUrlSpy = jest
  .spyOn(Linking, 'openURL')
  .mockImplementation(async () => 'opened');
const shareSpy = jest
  .spyOn(Share, 'share')
  .mockImplementation(async () => ({action: 'sharedAction'}));

function buildExpectedInviteUrl(code: string) {
  return new URL(`/j/${encodeURIComponent(code)}`, API_URL).toString();
}

const session: AuthResponse = {
  token: 'session-token',
  tokenExpiresAt: '2026-05-17T12:00:00.000Z',
  sessionId: 'session-1',
  user: {
    id: 'user-1',
    username: 'north',
    displayName: 'North',
    profession: 'Engineer',
    createdAt: '2026-05-01T10:00:00.000Z',
    avatarUrl: null,
    online: true,
  },
};

function createConference(overrides: Partial<VideoConference> = {}): VideoConference {
  return {
    id: 'conference-1',
    title: 'Weekly sync',
    roomName: 'weekly-sync',
    roomAccessCode: 'room-code',
    scheduledAt: '2026-05-17T12:00:00.000Z',
    createdAt: '2026-05-17T11:00:00.000Z',
    activatedAt: '2026-05-17T11:55:00.000Z',
    startedAt: null,
    endedAt: null,
    recordingCreatedAt: null,
    recordingSizeBytes: null,
    recordingMimeType: null,
    createdBy: {
      id: session.user.id,
      username: session.user.username,
      displayName: session.user.displayName,
      profession: session.user.profession,
      avatarUrl: null,
      online: true,
    },
    participants: [
      {
        id: session.user.id,
        username: session.user.username,
        displayName: session.user.displayName,
        profession: session.user.profession,
        avatarUrl: null,
        online: true,
      },
    ],
    chatId: 'chat-group-1',
    activeParticipantCount: 0,
    activeParticipantUserIds: [],
    ...overrides,
  };
}

describe('ConferenceDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    openUrlSpy.mockClear();
    shareSpy.mockClear();
  });

  it('starts a scheduled conference for the organizer', async () => {
    const onStartConference = jest.fn(async () =>
      createConference({
        startedAt: '2026-05-17T12:00:00.000Z',
      }),
    );

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ConferenceDetailScreen
          session={session}
          conference={createConference({
            roomName: null,
            roomAccessCode: null,
            activatedAt: null,
          })}
          onBack={() => undefined}
          onOpenChat={() => undefined}
          onStartConference={onStartConference}
          onEndConference={async () => createConference()}
          onCancelConference={async () => undefined}
          onCreateConferenceInviteLink={async () => ({code: 'invite-code'})}
          onTouchConferencePresence={async () => undefined}
          onClearConferencePresence={async () => undefined}
        />,
      );
    });

    const startButton = renderer!.root.findByProps({
      testID: 'conference-start-button',
    });
    await ReactTestRenderer.act(async () => {
      await startButton.props.onPress();
    });

    expect(onStartConference).toHaveBeenCalledWith('conference-1');
  });

  it('opens the conference in the external browser and marks presence', async () => {
    const onTouchConferencePresence = jest.fn(async () => undefined);

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ConferenceDetailScreen
          session={session}
          conference={createConference()}
          onBack={() => undefined}
          onOpenChat={() => undefined}
          onStartConference={async () => createConference()}
          onEndConference={async () => createConference()}
          onCancelConference={async () => undefined}
          onCreateConferenceInviteLink={async () => ({code: 'invite-code'})}
          onTouchConferencePresence={onTouchConferencePresence}
          onClearConferencePresence={async () => undefined}
        />,
      );
    });

    const joinButton = renderer!.root.findByProps({
      testID: 'conference-join-button',
    });
    await ReactTestRenderer.act(async () => {
      await joinButton.props.onPress();
    });

    expect(onTouchConferencePresence).toHaveBeenCalledWith('conference-1');
    expect(openUrlSpy).not.toHaveBeenCalled();
    expect(
      renderer!.root.findByProps({testID: 'conference-leave-button'}),
    ).toBeTruthy();
  });

  it('generates and shares a conference invite link', async () => {
    const onCreateConferenceInviteLink = jest.fn(async () => ({
      code: 'invite-code',
    }));

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ConferenceDetailScreen
          session={session}
          conference={createConference({chatId: null})}
          onBack={() => undefined}
          onOpenChat={() => undefined}
          onStartConference={async () => createConference()}
          onEndConference={async () => createConference()}
          onCancelConference={async () => undefined}
          onCreateConferenceInviteLink={onCreateConferenceInviteLink}
          onTouchConferencePresence={async () => undefined}
          onClearConferencePresence={async () => undefined}
        />,
      );
    });

    const generateInviteButton = renderer!.root.findByProps({
      testID: 'conference-generate-invite-button',
    });
    await ReactTestRenderer.act(async () => {
      await generateInviteButton.props.onPress();
    });

    expect(onCreateConferenceInviteLink).toHaveBeenCalledWith('conference-1', {
      refresh: false,
    });

    const shareInviteButton = renderer!.root.findByProps({
      testID: 'conference-share-invite-button',
    });
    await ReactTestRenderer.act(async () => {
      await shareInviteButton.props.onPress();
    });

    expect(shareSpy).toHaveBeenCalledWith({
      title: 'Weekly sync',
      message: buildExpectedInviteUrl('invite-code'),
      url: buildExpectedInviteUrl('invite-code'),
    });
  });
});
