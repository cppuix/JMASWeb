// api/audio.js
export default async function handler(req, res) {
    const { id } = req.query;

    if (!id) {
        return res.status(400).send('Missing file ID');
    }

    const googleUrl = `https://drive.google.com/uc?export=download&id=${id}`;

    try {
        const response = await fetch(googleUrl);

        if (!response.ok) throw new Error('Google Drive responded with an error');

        // Forward headers and stream the content
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Access-Control-Allow-Origin', '*'); // This fixes the CORS problem!
        
        const arrayBuffer = await response.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));
    } catch (error) {
        console.error(error);
        res.status(500).send('Error fetching audio from Google Drive');
    }
}