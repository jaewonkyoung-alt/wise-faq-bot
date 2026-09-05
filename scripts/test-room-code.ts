/**
 * Unit checks for room code parse + format.
 */
import { parseRoomCode, formatRoomAnswer, answerRoomCode } from '../src/services/roomCode';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function main() {
  const s504 = parseRoomCode('S504');
  assert(s504, 'S504 should parse');
  assert(s504.buildingCode === 'S', 'S504 building');
  assert(s504.roomNumber === '504', 'S504 number');
  assert(s504.floor === 5, 'S504 floor');
  const a504 = formatRoomAnswer(s504);
  assert(a504.ok, 'S504 ok');
  assert(/자연과학관/.test(a504.text), 'S504 building name: ' + a504.text);
  assert(/5층/.test(a504.text), 'S504 floor text: ' + a504.text);
  console.log('S504 →', a504.text.replace(/\n/g, ' | '));

  // variants
  for (const u of ['s-504', 'S 504', 's504', '호실 S504 어디야']) {
    const a = answerRoomCode(u);
    assert(a && a.ok && /자연과학관/.test(a.text), 'variant ' + u + ': ' + a?.text);
  }

  const a207 = answerRoomCode('A207');
  assert(a207 && a207.ok, 'A207 ok');
  assert(/원효관/.test(a207!.text), 'A207 building');
  assert(/2층/.test(a207!.text), 'A207 floor');
  console.log('A207 →', a207!.text.replace(/\n/g, ' | '));

  const zz = answerRoomCode('ZZ999');
  assert(zz && !zz.ok, 'ZZ999 should miss');
  assert(/찾지 못했/.test(zz!.text), 'ZZ999 honest miss: ' + zz!.text);
  assert(/추측해 안내하지 않습니다/.test(zz!.text), 'no hallucination pledge');
  assert(!/원효관|자연과학관|진흥관/.test(zz!.text), 'must not invent known building name');
  console.log('ZZ999 →', zz!.text.split('\n')[0]);

  // multi-letter preference: if BST present
  const bst = parseRoomCode('BST101');
  if (bst) {
    assert(bst.buildingCode === 'BST', 'BST multi-letter');
    const ans = formatRoomAnswer(bst);
    assert(ans.ok && /백상탑/.test(ans.text), 'BST → 백상탑');
    console.log('BST101 →', ans.text.replace(/\n/g, ' | '));
  }

  console.log('PASS test-room-code');
}

main();
