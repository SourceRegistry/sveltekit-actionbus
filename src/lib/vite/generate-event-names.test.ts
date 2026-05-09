import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { generateActionMetadata } from './generate-event-names.js';

describe('generateActionMetadata', () => {
	it('extracts channel patterns and nested event names from App.ActionEvents', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'actionbus-'));
		const appDtsPath = path.join(dir, 'app.d.ts');

		fs.writeFileSync(
			appDtsPath,
			`
				declare global {
					namespace App {
						interface ActionEvents {
							'project:\${string}': {
								'task.updated': { id: string; title: string };
								'task.deleted': { id: string };
							};
							'user:\${string}:notifications': {
								'notification.created': { id: string };
							};
						}
					}
				}
			`
		);

		const metadata = generateActionMetadata(appDtsPath);

		expect(metadata.channels).toEqual([
			{
				pattern: 'project:${string}',
				regExpSource: '^project:.+$',
				events: ['task.updated', 'task.deleted']
			},
			{
				pattern: 'user:${string}:notifications',
				regExpSource: '^user:.+:notifications$',
				events: ['notification.created']
			}
		]);
	});
});
