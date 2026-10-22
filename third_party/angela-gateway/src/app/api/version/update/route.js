export async function POST() {
  return Response.json({ error: "Install an Angela release to update Angela Gateway." }, { status: 409 });
}
