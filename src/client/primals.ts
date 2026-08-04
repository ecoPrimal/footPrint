// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * FootPrint Primal registration — self-describing capability registry.
 *
 * Registers footPrint domain capabilities at startup so other modules
 * (and the agent) can discover them at runtime without compile-time coupling.
 */

import { Primal, registerPrimal } from '../core/primal.js';
import { Ok, Err } from '../rustscript/result.js';
import { solveConstraints } from '../core/constraints.js';
import { getSourceIdsByCapability, listSourceManifests, type SourceCapability } from '../core/manifest.js';
import { CAS_PATH, PROJECTS_PATH } from '../constants.js';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const SOURCE_CAPABILITIES: ReadonlySet<string> = new Set<SourceCapability>([
  'discovery:auto-enable',
  'intelligence:utility-conflict',
]);

export function initFootPrintPrimals(): void {
  const footprint = new Primal('footprint', 'FootPrint', '2.0.0');

  footprint.expose({
    name: 'project.describe',
    description: 'Self-knowledge of project persistence (local FS + nestGate CAS)',
    version: '1.0.0',
    handle: () =>
      Ok({
        localPath: PROJECTS_PATH,
        casPath: CAS_PATH,
        operations: ['list', 'load', 'save', 'delete'],
      }),
  });

  footprint.expose({
    name: 'project.validate',
    description: 'Validate a ProjectFile-shaped payload synchronously',
    version: '1.0.0',
    handle: (input: unknown) => {
      if (!isRecord(input)) {
        return Err({ kind: 'InvalidInput', message: 'Expected project object' });
      }
      if (typeof input['name'] !== 'string' || typeof input['savedAt'] !== 'string') {
        return Err({ kind: 'InvalidInput', message: 'Project must include name and savedAt' });
      }
      if (!isRecord(input['layers'])) {
        return Err({ kind: 'InvalidInput', message: 'Project must include layers object' });
      }
      return Ok({ valid: true, name: input['name'] });
    },
  });

  footprint.expose({
    name: 'constraints.solve',
    description: 'Run the Gauss-Newton constraint solver on the current store',
    version: '1.0.0',
    handle: () => Ok(solveConstraints()),
  });

  footprint.expose({
    name: 'discovery.list-sources',
    description: 'List registered data source manifests',
    version: '1.0.0',
    handle: () => Ok(listSourceManifests()),
  });

  footprint.expose({
    name: 'discovery.by-capability',
    description: 'Find source IDs that provide a given capability tag',
    version: '1.0.0',
    handle: (input: unknown) => {
      if (!isRecord(input) || typeof input['capability'] !== 'string') {
        return Err({ kind: 'InvalidInput', message: 'Expected { capability: string }' });
      }
      const capability = input['capability'];
      if (!SOURCE_CAPABILITIES.has(capability)) {
        return Err({ kind: 'InvalidInput', message: 'Unknown source capability' });
      }
      return Ok(getSourceIdsByCapability(capability as SourceCapability));
    },
  });

  registerPrimal(footprint);
}
