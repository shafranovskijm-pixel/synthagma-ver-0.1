import { describe, expect, it } from "vitest";
import { parseOriginalCoursePackage } from "./originalCoursePackage";

function pack() { return {
  schema_version:1, source_kind:"original-private-course", package_id:"11111111-1111-4111-8111-111111111111",
  title:"Synthetic original", description:"Synthetic test only", code:"QA", version:"1", hours:3, approval_status:"unconfirmed",
  sources:[{id:"law",title:"Synthetic source",url:"https://example.org/law",locator:"§1"}],
  modules:[{key:"m",title:"Module",hours:3}], lessons:[
    {key:"l",module_key:"m",title:"Lecture",type:"text",hours:1,content:"<h2>Topic</h2><p>Example &lt; limit</p>",final_assessment:false,questions:[]},
    {key:"p",module_key:"m",title:"Practice",type:"homework",hours:1,content:"Inputs: 2 units. Deliver a calculation. Teacher checks reasoning.",final_assessment:false,questions:[]},
    {key:"t",module_key:"m",title:"Test",type:"test",hours:1,content:"",final_assessment:true,questions:[{key:"q",question:"Synthetic choice?",options:[{text:"One"},{text:"Two"}],correct_answer:1,explanation:"Synthetic explanation",source_ref:"law :: §1"}]},
  ],
}; }
describe("original course package", () => {
  it("preserves modules, lesson order, homework, explicit keys and explanations",()=>{
    const p=pack(); expect(parseOriginalCoursePackage(JSON.stringify(p))).toEqual(p);
    expect(p.lessons[0].content).not.toContain("correct_answer");
  });
  const mutations: Array<[string,(p:ReturnType<typeof pack>)=>void]> = [
    ["missing key",p=>{delete (p.lessons[2].questions[0] as Partial<typeof p.lessons[2]["questions"][0]>).correct_answer;}],
    ["out of range",p=>{p.lessons[2].questions[0].correct_answer=2;}],
    ["fractional key",p=>{p.lessons[2].questions[0].correct_answer=0.5;}],
    ["duplicate options",p=>{p.lessons[2].questions[0].options[1].text="One";}],
    ["duplicate module",p=>{p.modules.push(p.modules[0]);}],
    ["duplicate lesson",p=>{p.lessons[1].key="l";}],
    ["orphan lesson",p=>{p.lessons[1].module_key="missing";}],
    ["unknown source",p=>{p.lessons[2].questions[0].source_ref="missing :: §1";}],
    ["wrong total",p=>{p.hours=24;}],
    ["wrong module hours",p=>{p.lessons[1].hours=2;}],
    ["HTML homework",p=>{p.lessons[1].content="<p>Task</p>";}],
    ["script",p=>{p.lessons[0].content="<script>alert(1)</script>";}],
    ["event attribute",p=>{p.lessons[0].content='<p onclick="alert(1)">text</p>';}],
    ["iframe",p=>{p.lessons[0].content="<iframe></iframe>";}],
    ["HTML closed keys",p=>{p.lessons[2].content="Key is 1";}],
    ["questionless test",p=>{p.lessons[2].questions=[];}],
    ["approval claim",p=>{p.approval_status="approved";}],
    ["unknown private field",p=>{Object.assign(p.lessons[1],{modelReasoning:"Private model answer"});}],
  ];
  it.each(mutations)("rejects %s",(_,mutate)=>{const p=pack();mutate(p);expect(()=>parseOriginalCoursePackage(JSON.stringify(p))).toThrow();});
  it("rejects malformed JSON without echoing content",()=>expect(()=>parseOriginalCoursePackage('{"secret":"private bank"')).toThrow(/^Некорректный пакет/));
});
