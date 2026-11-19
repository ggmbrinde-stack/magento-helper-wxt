"""Native read fence around the existing durable MCP session."""
import copy
import uuid

import native_evidence as native
import rendered_layout as r


class NativeSession:
    def __init__(self, engine):
        self.engine = engine
        self.initial = engine.initial
        self.isolated = engine.isolated
        self.initial['native'] = {'snapshots': {}, 'reads': [], 'phase': None}

    def request(self, state, phase, page_id):
        gate = state['native']
        gate.update(phase=phase, nonce=uuid.uuid4().hex, page_id=page_id)
        return {'type': phase, 'nonce': gate['nonce'],
                'payload': {'page_id': page_id}, 'plan_sha256': state['plan_sha256']}

    def fence(self, state, action):
        if action['type'] != 'WRITE_PENDING':
            return action
        gate = state['native']
        gate['write_action'] = copy.deepcopy(action)
        page = state['queue'][state['page_index']]['page']
        if page['code'] not in gate['snapshots']:
            gate['snapshots'][page['code']] = page['native_evidence']['snapshot']
        # Engine has prepared its intent; FileSession persists this fence, not a write.
        return self.request(state, 'NATIVE_PREWRITE', page['page_id'])

    def stop(self, state, reason, uncertain):
        state['native']['phase'] = None
        # Do not issue even an error-status write after a native-read failure.
        state.update(status='UNCERTAIN' if uncertain else 'BLOCKED', phase='STOPPED')
        state['events'].append({'kind': state['status'], 'reason': reason})
        page = state['queue'][state['page_index']]['page']
        state.setdefault('page_reports', {})[page['code']] = {
            'code': page['code'], 'page_id': page['page_id'], 'outcome': state['status'],
            'reason': reason, 'pending_receipts': [state['native'].get('write_action', {}).get('nonce')] if uncertain else []}
        state.setdefault('quarantines', {})[page['code']] = {
            'uncertain': uncertain, 'reason': reason, 'native_unverified': True}
        return {'type': 'FINISH', 'status': state['status'], 'reason': reason}

    def begin(self, state):
        return self.fence(state, self.engine.begin(state))

    def step(self, state, event):
        import batch_apply
        batch_apply.verify_sources(self.engine.bundle, self.engine.fake)
        gate = state['native']
        phase = gate['phase']
        if phase is None:
            return self.fence(state, self.engine.step(state, event))
        if phase == 'NATIVE_WRITE':
            if event.get('nonce') != gate['write_action']['nonce']:
                raise ValueError('Wrong native-gated write nonce')
            gate['write_event'] = copy.deepcopy(event)
            if event.get('error') or event.get('result', {}).get('isError'):
                return self.stop(state, 'MCP write outcome unconfirmed; no retry', True)
            return self.request(state, 'NATIVE_POSTWRITE', gate['page_id'])
        if event.get('nonce') != gate['nonce']:
            raise ValueError('Stale native event')
        snapshot = event.get('result')
        # Raw sanitized responses and digest are durably saved by FileSession before return.
        gate['reads'].append({'phase': phase, 'nonce': gate['nonce'],
                              'response': copy.deepcopy(snapshot), 'sha256': r.digest(snapshot)})
        try:
            if event.get('error'):
                raise ValueError('Native subtree unreadable')
            if snapshot.get('synthetic') and not self.engine.fake:
                raise ValueError('Synthetic native response cannot be used live')
            tree = native.validate(snapshot, gate['page_id'], gate['nonce'])
            page = state['queue'][state['page_index']]['page']
            prior = gate['snapshots'][page['code']]
            if phase == 'NATIVE_PREWRITE':
                if tree != native.validate(prior, gate['page_id']):
                    raise ValueError('Native descendants changed despite MCP representation')
                if native.canonical_page(snapshot['before'], bool(snapshot.get('persistence_policy'))) != native.canonical_page(prior['after'], bool(prior.get('persistence_policy'))):
                    raise ValueError('Native page edit state or metadata changed')
                payload = gate['write_action']['payload']
                before = state.get('last_before_body', page['source_body'])
                evidence = native.proof({'page_id': page['page_id'], 'body': before,
                    'page_last_edited_at': snapshot['after']['last_edited_time'],
                    'source_state_sha256': state.get('last_state_hash', page['source_state_sha256'])}, snapshot)
                gate['expected'] = native.operation(before, payload, evidence)['expected_native']
                gate['phase'] = 'NATIVE_WRITE'
                return gate['write_action']
            native.verify_after(snapshot, gate['expected'], gate['page_id'], gate['nonce'])
            gate['snapshots'][page['code']] = snapshot
            gate['phase'] = None
            return self.fence(state, self.engine.step(state, gate.pop('write_event')))
        except (ValueError, KeyError, TypeError, IndexError) as error:
            return self.stop(state, str(error), phase == 'NATIVE_POSTWRITE')

    def cancel(self, state):
        if state['native']['phase']:
            return self.stop(state, 'Cancelled at native fence; no replay',
                             state['native']['phase'] != 'NATIVE_PREWRITE')
        return self.engine.cancel(state)

    def continue_batch(self, state):
        return self.stop(state, 'Native session requires new reviewed evidence; no replay', True)

    def reconcile(self, state, code=None):
        return self.stop(state, 'Native uncertainty requires fresh native and MCP evidence; no automatic reconciliation', True)
