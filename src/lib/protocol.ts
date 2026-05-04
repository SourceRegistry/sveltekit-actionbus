export type Action<Payload = unknown, Type extends string = string> = {
	type: Type;
	payload: Payload;
};

export type ActionChannelMap = App.ActionEvents;
export type ActionChannelPattern = Extract<keyof ActionChannelMap, string>;

type MatchTemplatePattern<
	Pattern extends string,
	Channel extends string
> = Pattern extends `${infer Prefix}\${string}${infer Suffix}`
	? Channel extends `${Prefix}${string}${Suffix}`
		? Pattern
		: never
	: Channel extends Pattern
		? Pattern
		: never;

export type ActionChannelPatternFor<Channel extends string> = {
	[Pattern in ActionChannelPattern]: MatchTemplatePattern<Pattern, Channel>;
}[ActionChannelPattern];

export type ActionChannel = string extends ActionChannelPattern
	? string
	: {
			[Pattern in ActionChannelPattern]: Pattern extends `${infer Prefix}\${string}${infer Suffix}`
				? `${Prefix}${string}${Suffix}`
				: Pattern;
		}[ActionChannelPattern];

type EventsForPattern<Pattern extends ActionChannelPattern> = ActionChannelMap[Pattern];
type EventNameForPattern<Pattern extends ActionChannelPattern> = Extract<
	keyof EventsForPattern<Pattern>,
	string
>;
type NamedEventForPattern<
	Pattern extends ActionChannelPattern,
	EventName extends EventNameForPattern<Pattern>
> = EventsForPattern<Pattern>[EventName] & { type: EventName };

export type ActionEventForChannel<Channel extends string> =
	ActionChannelPatternFor<Channel> extends infer Pattern
		? Pattern extends ActionChannelPattern
			? {
					[EventName in EventNameForPattern<Pattern>]: NamedEventForPattern<Pattern, EventName>;
				}[EventNameForPattern<Pattern>]
			: never
		: never;

export type ActionEventForChannels<Channels extends readonly string[]> =
	Channels[number] extends infer Channel
		? Channel extends string
			? ActionEventForChannel<Channel>
			: never
		: never;

export type ActionEventTypeForChannels<Channels extends readonly string[]> = Extract<
	ActionEventForChannels<Channels>['type'],
	string
>;

export type ActionReducerMap<State, Channels extends readonly string[]> = Partial<{
	[Type in ActionEventTypeForChannels<Channels>]: (
		state: State,
		message: Extract<ActionMessage<Channels[number]>, { event: { type: Type } }>
	) => State;
}>;

export type ActionMessage<Channel extends string = string> = {
	channel: Channel;
	event: ActionEventForChannel<Channel>;
};

export type ActionBusError<Channel extends string = string> = {
	code: string;
	message: string;
	channel?: Channel;
	receivedAt: string;
};

export type ActionBusState = {
	connected: boolean;
	reconnecting: boolean;
	lastError: string | null;
	lastEventAt: string | null;
	lastReconnectAt: string | null;
};

export type ActionBusMetadata = {
	channels: {
		pattern: string;
		regExpSource: string;
		events: string[];
	}[];
};

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function isActionEnvelope(value: unknown): value is Action {
	return (
		isRecord(value) &&
		typeof value.type === 'string' &&
		Object.prototype.hasOwnProperty.call(value, 'payload')
	);
}

export function createInitialActionBusState(): ActionBusState {
	return {
		connected: false,
		reconnecting: false,
		lastError: null,
		lastEventAt: null,
		lastReconnectAt: null
	};
}

export function findActionChannelMetadata(
	metadata: ActionBusMetadata,
	channel: string
): ActionBusMetadata['channels'][number] | undefined {
	return metadata.channels.find((entry) => new RegExp(entry.regExpSource).test(channel));
}

export function isKnownActionChannel(
	metadata: ActionBusMetadata,
	channel: unknown
): channel is string {
	return typeof channel === 'string' && !!findActionChannelMetadata(metadata, channel);
}

export function isKnownActionEventForChannel(
	metadata: ActionBusMetadata,
	channel: string,
	event: unknown
): event is Action {
	if (!isActionEnvelope(event)) return false;
	const channelMetadata = findActionChannelMetadata(metadata, channel);
	return !!channelMetadata?.events.includes(event.type);
}
