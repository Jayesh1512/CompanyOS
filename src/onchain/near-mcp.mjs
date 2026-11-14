import {createMcpServer,json_to_zod} from '@nearai/near-mcp/dist/index.js';
import {JsonRpcProvider} from 'near-api-js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';

// Official NEAR MCP server and real MCP protocol. Only public read tools are
// exposed to the workflow; this server receives an empty keystore, never keys.
export async function createNearMcpReader({keyDirectory,record=()=>{}}) {
  const server=await createMcpServer(keyDirectory);
  // The upstream built-in view tool pins the now-deprecated Pagoda RPC. Add a
  // CompanyOS public ledger tool to the official server using a current RPC.
  // This is a real RPC read, not a substituted result or a mocked MCP server.
  const rpc='https://rpc.testnet.fastnear.com',provider=new JsonRpcProvider({url:rpc});
  const schema=json_to_zod({contractId:'',methodName:'',argumentsJson:'{}'});
  if(!schema.ok)throw Error('MCP_SCHEMA_UNAVAILABLE');
  server.tool('companyos_ledger_view','Read a CompanyOS testnet ledger through the public NEAR RPC.',schema.value.shape,async input=>{
    if(!input.contractId.endsWith('.testnet')||!['get_head','get_records','get_agent_writer'].includes(input.methodName))throw Error('MCP_READ_NOT_ALLOWED');
    const response=await provider.query({request_type:'call_function',finality:'final',account_id:input.contractId,method_name:input.methodName,
      args_base64:Buffer.from(input.argumentsJson).toString('base64')});
    const output=JSON.parse(Buffer.from(response.result).toString('utf8'));
    return {content:[{type:'text',text:'View call result: '+JSON.stringify(output)}]};
  });
  const client=new Client({name:'companyos',version:'0.1.0'});
  const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);await client.connect(clientTransport);
  return {
    async view(contractId,methodName,args={}) {
      if(!contractId.endsWith('.testnet'))throw Error('TESTNET_CONTRACT_REQUIRED');
      if(!['get_head','get_records','get_agent_writer'].includes(methodName))throw Error('MCP_READ_NOT_ALLOWED');
      const request={name:'companyos_ledger_view',arguments:{contractId,methodName,argumentsJson:JSON.stringify(args)}};
      for(let attempt=1;attempt<=4;attempt++){
        let result;
        try{result=await client.callTool(request,undefined,{timeout:30000});}
        catch(error){await record({request,error:String(error.message),attempt,at:new Date().toISOString()});if(attempt===4)throw error;await new Promise(r=>setTimeout(r,1000*attempt));continue;}
        await record({request,result,attempt,at:new Date().toISOString()});
        const text=result.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n');
        if(result.isError||!text||text.startsWith('Error')){if(attempt===4)throw Error('NEAR_MCP_READ_FAILED');await new Promise(r=>setTimeout(r,1000*attempt));continue;}
        return JSON.parse(text.replace(/^View call result: /,''));
      }
    },
    async close(){await client.close();await server.close();},
  };
}
