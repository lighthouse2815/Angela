export async function POST() {
  return Response.json({ error: "Stop Angela Gateway from its owning terminal with Ctrl+C." }, { status: 409 });
}
