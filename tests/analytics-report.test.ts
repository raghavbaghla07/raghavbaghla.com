import assert from 'node:assert/strict';
import test from 'node:test';
import { changeLabel, csvText, displayMetric, ratio } from '../src/lib/analytics-report.ts';

test('period comparisons distinguish missing data and a zero baseline', () => {
  assert.equal(changeLabel(5,0),'New this period');
  assert.equal(changeLabel(null,30),'No comparison');
  assert.equal(changeLabel(30,20),'+50%');
  assert.equal(changeLabel(0,5),'-100%');
  assert.equal(displayMetric('average',108),'1m 48s');
  assert.equal(displayMetric('rate',null),'—');
  assert.equal(ratio(0,0),'—');
});

test('CSV retains columns and protects spreadsheet formula cells', () => {
  assert.equal(csvText(['Title','Views'],[[' ="a",b',12],['line\n"two"',0]]),
    '\uFEFF"Title","Views"\r\n"\' =""a"",b","12"\r\n"line\n""two""","0"');
});
