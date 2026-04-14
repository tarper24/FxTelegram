export default {
  async fetch(_request: Request): Promise<Response> {
    return new Response('FxTelegram', { status: 200 });
  },
};
