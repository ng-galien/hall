import { chromium } from '@playwright/test';
import { meetingConductWorkspaceSchema } from '@hall/api-contract';
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage({viewport:{width:354,height:582}});
  page.on('pageerror', error=>console.log('pageerror',error.message));
  await page.addInitScript(() => localStorage.setItem('mairie.locale','fr'));
  const origin='http://localhost:5174';
  const reference='2026-09-06-004';
  const uuid='11111111-1111-4111-8111-111111111111';
  const member='22222222-2222-4222-8222-222222222222';
  const at='2026-09-05T09:00:00.000Z';
  let postCount=0;
  let submitted=null;
  await page.route('**/api/**',async route=>{
    const request=route.request();
    if(request.method()!=='GET') {
      postCount++;
      submitted=request.postDataJSON();
      await route.fulfill({status:409,contentType:'application/problem+json',body:JSON.stringify({type:'about:blank',title:'Invalid reconvocation',status:409,code:'request_failed'})});
      return;
    }
    const response=await route.fetch();
    if(!request.url().endsWith('/conduct')) return route.fulfill({response});
    const body=await response.json();
    const state=body.properties;
    const agendaResponse=await page.request.get(`${origin}/api/council-meetings/${reference}/agenda-items`);
    const agenda=await agendaResponse.json();
    const itemIds=(agenda.entities??[]).flatMap(e=>e.properties?.id?[e.properties.id]:[]);
    if(!itemIds.length) throw new Error('Fixture requires existing agenda items');
    state.quorumObservations=[{id:uuid,councilMeetingId:state.meeting.id,observedAt:at,recordedAt:at,recordedBy:'isolated-browser-fixture',agendaItemId:null,facts:{membershipRecordId:uuid,membersInOffice:[{councilMemberId:member,name:'Fixture member'}],membershipObservedAt:at,membershipSourceReference:'isolated fixture',memberCount:15,excludedMemberIds:[],denominatorExcludedMemberIds:[],denominator:15,requiredPresent:8,presentMemberIds:[],presentCount:7,regime:'ordinary',verdict:'notMet',reconvocationId:null,attendance:[],remainingAgendaItemIds:itemIds}}];
    state.canRecordReconvocation=true;
    meetingConductWorkspaceSchema.parse(state);
    body.actions=[...(body.actions??[]),{name:'meeting.record-reconvocation',method:'POST',href:`/api/council-meetings/${reference}/reconvocations`,type:'application/json'}];
    await route.fulfill({response,contentType:'application/vnd.siren+json',body:JSON.stringify(body)});
  });
  await page.goto(`${origin}/app/meetings/${reference}/live`);
  await page.getByTestId('live-opening-quorum-not-met').waitFor({timeout:10000}).catch(async error=>{console.log(await page.locator('body').innerText()); throw error;});
  await page.getByTestId('live-reconvocation-open').click();
  await page.getByTestId('live-reconvocation-submit').click();
  if(postCount!==0) throw new Error('Empty form submitted');
  await page.getByTestId('live-reconvocation-sent-at').fill('2026-09-05T12:00');
  await page.getByTestId('live-reconvocation-scheduled-at').fill('2026-09-10T18:00');
  await page.getByTestId('live-reconvocation-first-evidence').fill('Fixture first notice');
  await page.getByTestId('live-reconvocation-renewed-evidence').fill('Fixture second notice');
  await page.getByTestId('live-reconvocation-submit').click();
  await page.waitForFunction(()=>document.querySelector('[data-testid="live-reconvocation-form"]')?.textContent?.includes('requête'));
  if(postCount!==1) throw new Error(`Expected one intercepted POST, got ${postCount}`);
  if(await page.getByTestId('live-reconvocation-first-evidence').inputValue()!=='Fixture first notice') throw new Error('Lost input after refusal');
  await page.screenshot({path:'/tmp/hall-reconvocation-modal-mobile.png'});
  await page.getByTestId('live-reconvocation-cancel').click();
  await page.getByTestId('live-reconvocation-form').waitFor({state:'hidden',timeout:3000});
  console.log(JSON.stringify({emptyFormPosts:0,refusedPosts:postCount,submitted,retainedInput:true,cancelClosed:true,realMutations:0}));
} finally {await browser.close();}
