import test from 'node:test'
import assert from 'node:assert/strict'
import {parsePlaceResults,appendPlaceReference} from '../src/services/placeSearch.ts'

test('swisstopo northing/easting are emitted in LV95 E,N order; invalid results are ignored',()=>{
  const hits=parsePlaceResults({results:[{attrs:{label:'<b>Industriestrasse 5</b> Walenstadt',y:2741650.25,x:1220435,lat:47.11974,lon:9.3054}},{attrs:{label:'wrong projection',y:741650,x:220435,lat:47,lon:9}},{}]})
  assert.deepEqual(hits,[{label:'Industriestrasse 5 Walenstadt',E:2741650.25,N:1220435,lat:47.11974,lon:9.3054}])
  const notes=appendPlaceReference('Schematische Platzierung erlaubt.','Industriestrasse',hits[0])
  assert.match(notes,/Industriestrasse: \[2741650.25, 1220435\]/)
  assert.ok(notes.startsWith('Schematische Platzierung erlaubt.\n'))
  assert.equal(appendPlaceReference(notes,'Industriestrasse',hits[0]),notes)
})
