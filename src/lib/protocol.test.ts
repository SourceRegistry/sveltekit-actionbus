import { describe, expectTypeOf, it } from 'vitest';
import type { Action, ActionEventForChannel, ActionReducerMap } from './protocol.js';

declare global {
	namespace App {
		interface ActionEvents {
			'payload-type:${string}': {
				'thing.changed': { id: string; type: 'domain-type' };
			};
		}
	}
}

describe('protocol types', () => {
	it('keeps payload.type nested without overriding the event type', () => {
		type Event = ActionEventForChannel<'payload-type:demo'>;

		expectTypeOf<Event>().toEqualTypeOf<
			Action<{ id: string; type: 'domain-type' }, 'thing.changed'>
		>();
		expectTypeOf<Event['type']>().toEqualTypeOf<'thing.changed'>();
		expectTypeOf<Event['payload']['type']>().toEqualTypeOf<'domain-type'>();
	});

	it('keeps reducer messages discriminated by event type', () => {
		type Reducers = ActionReducerMap<number, readonly ['payload-type:demo']>;
		type Message = Parameters<NonNullable<Reducers['thing.changed']>>[1];

		expectTypeOf<Message['event']['type']>().toEqualTypeOf<'thing.changed'>();
		expectTypeOf<Message['event']['payload']['type']>().toEqualTypeOf<'domain-type'>();
	});
});
