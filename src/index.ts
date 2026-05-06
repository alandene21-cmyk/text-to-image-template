interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string;
  method: string;
  params?: any;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("MCP server. POST only.", {
        status: 405,
        headers: corsHeaders,
      });
    }

    let body: JsonRpcRequest;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
    }

    const respond = (result: any) =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), {
        headers: { "content-type": "application/json", ...corsHeaders },
      });

    if (body.method === "initialize") {
      return respond({
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "image-gen", version: "1.0.0" },
      });
    }

    if (body.method === "notifications/initialized") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (body.method === "tools/list") {
      return respond({
        tools: [
          {
            name: "generate_image",
            description: "Generate an image from a text prompt using Flux on Cloudflare Workers AI",
            inputSchema: {
              type: "object",
              properties: {
                prompt: {
                  type: "string",
                  description: "Description of the image to generate",
                },
              },
              required: ["prompt"],
            },
          },
        ],
      });
    }

    if (body.method === "tools/call") {
      const { name, arguments: args } = body.params;
      if (name !== "generate_image") {
        return respond({
          isError: true,
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
        });
      }

      try {
        const aiResponse: any = await env.AI.run(
          "@cf/black-forest-labs/flux-1-schnell",
          { prompt: args.prompt }
        );
        return respond({
          content: [
            {
              type: "image",
              data: aiResponse.image,
              mimeType: "image/jpeg",
            },
          ],
        });
      } catch (err: any) {
        return respond({
          isError: true,
          content: [{ type: "text", text: `Error generating image: ${err.message}` }],
        });
      }
    }

    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        error: { code: -32601, message: "Method not found" },
      }),
      { status: 200, headers: { "content-type": "application/json", ...corsHeaders } }
    );
  },
} satisfies ExportedHandler<Env>;
