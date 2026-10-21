export interface Question {
  id: string; version: number; prompt: string; help: string;
  type: 'yn'|'status'|'coverage'|'select'|'multi'|'date'|'text'|'number';
  options: {id: string; label: string}[];
}
export interface Answer {
  questionId: string; questionVersion: number; state: 'answered'|'unknown'|'notApplicable'|'never';
  justification?: string; evidenceReference?: string;
  booleanValue?: boolean; textValue?: string; numberValue?: number; unit?: string; dateValue?: string;
  selectedOptionId?: string; selections?: string[];
  totalInScope?: number; totalCovered?: number; estimatedPercentage?: number;
  measurementDate?: string; measurementSource?: string;
}
export class QuestionnaireInputError extends Error {}
const fail = (message: string): never => { throw new QuestionnaireInputError(message); };
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('A JSON object is required.');
  return value as Record<string, unknown>;
}
function text(value: unknown, maximum: number, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) return fail(`${name} is required (up to ${maximum} characters).`);
  return value.trim();
}
function date(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value<'0001-01-01' ||
    !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value) return fail('Enter a valid date.');
  return value;
}
function number(value: unknown, maximum: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value<0 || value>maximum || (integer && !Number.isInteger(value))) return fail('Enter a valid non-negative number within the allowed range.');
  if (!integer && Math.abs(value*10000-Math.round(value*10000))>0.0001) return fail('Use at most four decimal places.');
  return value;
}
export function parseAnswers(value: unknown, questions: Question[]): Answer[] {
  if (!Array.isArray(value) || value.length>questions.length) return fail('Invalid answer list.');
  const seen = new Set<string>();
  return value.map(raw => {
    const input=object(raw), question=questions.find(q=>q.id===input.questionId && q.version===input.questionVersion);
    if (!question || seen.has(question.id)) return fail('Unknown, duplicate or outdated question.');
    seen.add(question.id);
    if (!['answered','unknown','notApplicable','never'].includes(String(input.state))) return fail('Invalid answer state.');
    const answer: Answer={questionId:question.id,questionVersion:question.version,state:input.state as Answer['state']};
    const permitted=['questionId','questionVersion','state','justification','evidenceReference'];
    for (const field of ['justification','evidenceReference'] as const) {
      if (input[field]!==undefined) answer[field]=text(input[field],2000,field);
    }
    if (answer.state==='notApplicable' && !answer.justification) return fail('Explain why this question is not applicable.');
    if (answer.state==='never' && question.type!=='date') return fail('Never is only valid for date questions.');
    if (answer.state==='answered') {
      switch (question.type) {
        case 'yn':
          permitted.push('booleanValue');
          if(typeof input.booleanValue!=='boolean') return fail('Choose Yes or No.');
          answer.booleanValue=input.booleanValue; break;
        case 'text': permitted.push('textValue'); answer.textValue=text(input.textValue,4000,'Answer'); break;
        case 'number':
          permitted.push('numberValue','unit'); answer.numberValue=number(input.numberValue,99999999999999);
          answer.unit=text(input.unit,32,'Unit'); break;
        case 'date': permitted.push('dateValue'); answer.dateValue=date(input.dateValue); break;
        case 'select': case 'status':
          permitted.push('selectedOptionId');
          if (!question.options.some(o=>o.id===input.selectedOptionId)) return fail('Choose an available option.');
          answer.selectedOptionId=input.selectedOptionId as string;
          if(answer.selectedOptionId==='other' && !answer.justification) return fail('Describe the Other option.');
          break;
        case 'multi': {
          permitted.push('selections'); const choices=input.selections;
          if (!Array.isArray(choices) || !choices.length || new Set(choices).size!==choices.length ||
              choices.some(id=>!question.options.some(o=>o.id===id)) || (choices.includes('none') && choices.length>1)) return fail('Choose valid options; None must be selected alone.');
          answer.selections=choices as string[]; break;
        }
        case 'coverage':
          permitted.push('totalInScope','totalCovered','estimatedPercentage','measurementDate','measurementSource');
          if (input.estimatedPercentage!==undefined) {
            if(input.totalInScope!==undefined || input.totalCovered!==undefined) return fail('Use counts or an estimate, not both.');
            answer.estimatedPercentage=number(input.estimatedPercentage,100);
          } else {
            answer.totalInScope=number(input.totalInScope,2147483647,true);
            answer.totalCovered=number(input.totalCovered,2147483647,true);
            if(answer.totalInScope===0) return fail('Zero systems requires an applicability review; select Not applicable with an explanation or Unknown.');
            if(answer.totalCovered>answer.totalInScope) return fail('Covered systems cannot exceed total systems.');
          }
          answer.measurementDate=date(input.measurementDate);
          answer.measurementSource=text(input.measurementSource,500,'Measurement source'); break;
      }
    }
    if (Object.keys(input).some(key=>!permitted.includes(key))) return fail('The answer contains fields that do not match its type or state.');
    return answer;
  });
}
export function parseScope(value: unknown) {
  const input=object(value);
  const assetClass=String(input.assetClass);
  if(!['END','SRV','DB','SaaS','CLD','NET'].includes(assetClass)) return fail('Choose an asset class.');
  const tenantId=input.tenantId===undefined || input.tenantId==='' ? null : text(input.tenantId,36,'Tenant ID');
  if(tenantId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) return fail('Enter a valid tenant ID or leave it blank.');
  return {scopeName:text(input.scopeName,200,'Scope name'),assetClass,tenantId};
}
