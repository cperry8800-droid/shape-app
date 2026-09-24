import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../public/newdesign/livingProfilePage.jsx',import.meta.url),'utf8');
const body=src.match(/function lvProfileIdentity\([\s\S]*?\n\}/)?.[0];
assert.ok(body);
const identity=new Function('return ('+body+');')();
const demo={handle:'@demo',pronouns:'she/her',city:'Brooklyn',link:['Demo','demo.test']};
test('cleared real profile fields remain clear instead of showing example details',()=>{
 assert.deepEqual(identity({handle:'',username:'login',pronouns:'',location:'',link:''},demo,false,false),{handle:'',pronouns:'',city:'',link:null});
 assert.deepEqual(identity({},demo,false,false),{handle:'',pronouns:'',city:'',link:null});
});
test('the owner identity is shown and public username is used only without an explicit owner handle',()=>{
 assert.deepEqual(identity({handle:'@owner',pronouns:'they/them',location:'Austin',link:'https://coach.test'},demo,false,false),{handle:'@owner',pronouns:'they/them',city:'Austin',link:['Link','coach.test']});
 assert.equal(identity({username:'public_name'},demo,false,false).handle,'@public_name');
 assert.deepEqual(identity({pronouns:'they/them',location:'Austin',link:'https://coach.test'},demo,false,true),{handle:'',pronouns:'',city:'',link:null});
 assert.deepEqual(identity({},demo,true,false),demo);
});
