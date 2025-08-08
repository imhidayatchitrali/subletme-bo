import app from './app';

const port: number = parseInt(process.env.PORT || '8082', 10);

export const server = app.listen(port, () => {
    console.log(`Server running at port ${port}`);
});
