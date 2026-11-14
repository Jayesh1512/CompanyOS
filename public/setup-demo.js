import {AUTONOMY_INTENT} from './autonomy-intent.js';

// Explicit UI sample input only. No API calls, provider fixtures, saved records,
// permissions, funds or execution state are created by enabling Demo mode.
export const SETUP_DEMO_BRIEF=Object.freeze({
 name:'Northstar Care (Demo)',
 purpose:'Run a customer-care agency for fictional Harbor Mutual Insurance using approved policy knowledge and owner-reviewed escalations.',
 industry:'Customer care · fictional insurance',
 customer:'Harbor Mutual Insurance — fictional customer-care client',
 outcome:'Cited policy replies, claims guidance and owner-review tickets',
 objective:'Set up policy and claims guides, publish their customer-care services, and answer a policy question from approved knowledge.',
});
export const SETUP_DEMO_KNOWLEDGE=Object.freeze({
 title:'Northstar Care · fictional company brief',
 visibility:'company',
 body:'# Northstar Care — fictional example\n\nThese company details are fictional. There are no real customers, revenue or results.\n\n## Purpose\nHelp fictional Harbor Mutual customers understand the published auto, home, travel and claims policies.\n\n## Working approach\nThe manager coordinates approved work. The backlog tracks process gaps and requests evaluated improvements. Specialists can be requested when permitted. Use exact approved policy excerpts and escalate unsupported or individual claim decisions.\n\n## First objective\nConfigure the agency team and publish policy and claims guides in the local marketplace.\n\n## Execution\nThis sample does not configure providers, credit, spending authority or accepted model-output proof. Saving it stores real local company knowledge; document grants and selected agent context still apply.\n',
});
export function setupDemoDraft(state,form={}){
 const company=state.autonomy?.company,organization=state.setup?.organization??state.data?.organization??{},draft=state.companySetupDraft??{};
 const brief={};for(const key of Object.keys(SETUP_DEMO_BRIEF)){
  const entered=draft.brief?.[key];
  brief[key]=[form[key],entered!==SETUP_DEMO_BRIEF[key]?entered:undefined,company?.brief?.[key],organization[key],entered,SETUP_DEMO_BRIEF[key]].find(v=>typeof v==='string'&&v.trim());
 }
 const intent={...AUTONOMY_INTENT,...company?.intent,...draft.intent};
 if(form.maxAgents!==undefined&&Number.isSafeInteger(Number(form.maxAgents))&&Number(form.maxAgents)>0)intent.maxAgents=Number(form.maxAgents);
 return {brief,intent};
}
