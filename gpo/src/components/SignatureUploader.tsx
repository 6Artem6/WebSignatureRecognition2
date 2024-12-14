import React, { useState, useRef, useEffect } from "react";
import "../App.css";
import axios from "axios";

interface Signature {
    id: number;
    name: string;
    url: string;
    blobUrl?: string;
}

interface GetSignaturesInfoResponse {
    id: number;
    name: string;
}

const SignatureUploader: React.FC = () => {

    const DETECT_PATH = "http://localhost:5000";

    const API_PATH = "http://localhost:7015";

    const [signatures, setSignatures] = useState<{ original: Signature[], test: Signature[] }>({
        original: [],
        test: [],
    });

    const [selectedSignatures, setSelectedSignatures] = useState<{ original: string | null, test: string | null }>({
        original: null,
        test: null,
    });

    const [previews, setPreviews] = useState<{ original: string | null, test: string | null }>({
        original: null,
        test: null,
    });

    const [isSelecting, setIsSelecting] = useState(false);
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });
    const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);

    type ResponseBlobType = {
        fileOriginal: string;
        fileCheck: string;
    };

    type ResponseDetectType = {
        fileOriginal: number[][];
        fileCheck: number[][];
    };

    type ResponseVerifyType = {
        [key: string]: {
            [index: string]: string ;
        };
    };

    type filesType = "original" | "test";

    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const originalInputRef = useRef<HTMLInputElement | null>(null);
    const testInputRef = useRef<HTMLInputElement | null>(null);

    const getToken = (): string | null => {
        const token = localStorage.getItem("token");
        if (!token) {
            setError("Токен отсутствует. Авторизуйтесь снова.");
            return null;
        }

        const payload = JSON.parse(atob(token.split('.')[1]));
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp < now) {
            setError("Токен истёк. Авторизуйтесь снова.");
            return null;
        }
        return token;
    };

    const fetchSignatures = async () => {
        setLoading(true);
        setError(null);

        const token = getToken();
        if (!token) return;

        console.log("Используем токен:", token);

        const headers = {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
        };

        console.log("Заголовки запроса:", headers);

        try {
            const response = await axios.get<GetSignaturesInfoResponse[]>(`${API_PATH}/api/Signatures/Information/Get`, {
                headers,
            });

            console.log("Ответ от сервера:", response);

            if (response.status === 200) {
                const fetchedSignatures: Signature[] = response.data.map((sig: GetSignaturesInfoResponse) => ({
                    id: sig.id,
                    name: sig.name,
                    url: `${API_PATH}/api/Signatures/GetSignature?fileId=${sig.id}`,
                }));

                for (const sig of fetchedSignatures) {
                    const imageResponse = await axios.get(sig.url, {
                        responseType: 'blob',
                        headers: headers,
                    });
                    sig.blobUrl = URL.createObjectURL(imageResponse.data); // Создаём Blob-URL
                }

                setSignatures((prev) => ({
                    ...prev,
                    original: fetchedSignatures,
                }));
            } else {
                setError("Ошибка при загрузке подписей.");
            }
        } catch (Ошибка: unknown) {
            if (axios.isAxiosError(error) && error.response) {
                if (error.response.status === 401) {
                    setError("Токен истек или недействителен. Пожалуйста, авторизуйтесь снова.");
                } else {
                    setError("Не удалось загрузить подписи.");
                }
            } else {
                setError("Произошла неизвестная ошибка.");
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSignatures();
    }, []);

    const handleFileChange = async (
        event: React.ChangeEvent<HTMLInputElement>,
        type: "original" | "test"
    ) => {
        const files = event.target.files;
        if (files) {
            const newSignatures: Signature[] = Array.from(files).map((file, index) => ({
                id: signatures[type].length + index + 1,
                name: file.name,
                blobUrl: URL.createObjectURL(file),
            }));

            if (type === "original") {
                const token = getToken();
                if (!token) return;

                try {
                    const formData = new FormData();
                    Array.from(files).forEach((file) => formData.append("file", file));

                    await axios.post(`${API_PATH}/api/Signatures/AddSignature`, formData, {
                        headers: {
                            "Content-Type": "multipart/form-data",
                            Authorization: `Bearer ${token}`,
                        },
                    });

                    fetchSignatures();
                } catch (error) {
                    console.error("Ошибка при загрузке подписей", error);
                    setError("Не удалось загрузить подписи.");
                }
            } else {
                setSignatures((prev) => ({
                    ...prev,
                    [type]: [...prev[type], ...newSignatures],
                }));
            }
        }
    };

    const handleDeleteSignature = async (fileId: number) => {
        try {
            const token = getToken();
            if (!token) {
                throw new Error("Токена нет");
            }

            await axios.delete(`${API_PATH}/api/Signatures/DeleteSignature`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: '*/*',
                },
                params: { fileId },
            });

            console.log(`Файл с ID ${fileId} успешно удален.`);

            setSignatures((prev) => ({
                ...prev,
                original: prev.original.filter((signature) => signature.id !== fileId),
            }));
        } catch (error) {
            console.error("Ошибка при удалении подписи", error);
            setError("Не удалось удалить подпись.");
        }
    };

    const handleSelectSignature = (type: "original" | "test", url: string) => {
        setSelectedSignatures((prev) => ({ ...prev, [type]: url }));
        setPreviews((prev) => ({ ...prev, [type]: url }));

        const img = document.getElementsByClassName(`image${type}`)[0] as HTMLImageElement;

        loadImageOnCanvas(url, type);

        img.onload = () => {
            const canvas = document.getElementsByClassName(`canvas${type}`)[0] as HTMLCanvasElement;
            // Инициализируем canvas
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return 0;
            }
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // Рисуем изображение на canvas
            ctx.drawImage(img, 0, 0);
        }
    };

    const base64ToBlob = (base64, mimeType = 'image/jpeg') => {
        // Декодируем Base64
        const byteCharacters = atob(base64);

        // Создаем массив байтов
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }

        const byteArray = new Uint8Array(byteNumbers);

        // Создаем Blob
        return new Blob([byteArray], { type: mimeType });
    }

    const drawRect = (rect: number[], img: HTMLImageElement, canvas: HTMLCanvasElement, type: filesType) => {
        if (rect.length !== 4) {
            return 0;
        }
        // Получаем размеры изображения
        const imgWidth = img.width;
        const imgHeight = img.height;

        // Инициализируем canvas
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return 0;
        }

        canvas.width = imgWidth;
        canvas.height = imgHeight;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Рисуем изображение на canvas
        ctx.drawImage(img, 0, 0);

        // Переводим процентные координаты в пиксели
        const y1 = rect[0] * canvas.height;
        const x1 = rect[1] * canvas.width;
        const y2 = rect[2] * canvas.height;
        const x2 = rect[3] * canvas.width;

        const height = y2 - y1;
        const width = x2 - x1;

        // Рисуем
        ctx.beginPath();
        ctx.rect(x1, y1, width, height);
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 5;
        ctx.stroke();

        updateHiddenInputs(type, x1, y1, x2, y2);
    };

    const handleTransformSignatures = async () => {
        if (selectedSignatures.original && selectedSignatures.test) {
            const fileOriginal = document.getElementsByName('fileOriginal')[0] as HTMLInputElement;
            const fileTest = document.getElementsByName('fileTest')[0] as HTMLInputElement;
            if (!fileOriginal.files?.[0] || !fileTest.files?.[0]) {
                alert('Пожалуйста, выберите оба файла перед загрузкой.');
                return;
            }
            const formData = new FormData();
            formData.append('fileOriginal', fileOriginal.files[0]);
            formData.append('fileTest', fileTest.files[0]);
            try {
                const response = await fetch(`${DETECT_PATH}/transform-signatures`, {
                    method: 'POST',
                    body: formData,
                });
                if (!response.ok) {
                    const error = await response.json();
                    const table = document.getElementsByClassName('data-tbody')[0] as HTMLElement;
                    table.innerHTML = `Ошибка: ${error}`;
                    return;
                }
                const result = await response.json() as ResponseBlobType;
                loadImageOnCanvas(URL.createObjectURL(base64ToBlob(result['fileOriginal'])), 'original');
                loadImageOnCanvas(URL.createObjectURL(base64ToBlob(result['fileTest'])), 'test');
            } catch (error) {
                console.error('Ошибка при загрузке файлов:', error);
                const table = document.getElementsByClassName('data-tbody')[0] as HTMLElement;
                table.innerHTML = `Проблема загрзки`;
            }
        } else {
            alert("Пожалуйста, выберите оригинальную подпись и проверяемую подпись.");
        }
    }

    const handleDetectSignatures = async () => {
        if (selectedSignatures.original && selectedSignatures.test) {
            const fileOriginal = document.getElementsByName('fileOriginal')[0] as HTMLInputElement;
            const fileTest = document.getElementsByName('fileTest')[0] as HTMLInputElement;
            if (!fileOriginal.files?.[0] || !fileTest.files?.[0]) {
                alert('Пожалуйста, выберите оба файла перед загрузкой.');
                return;
            }
            const formData = new FormData();
            formData.append('fileOriginal', fileOriginal.files[0]);
            formData.append('fileTest', fileTest.files[0]);
            try {
                const response = await fetch(`${DETECT_PATH}/detect-signatures`, {
                    method: 'POST',
                    body: formData,
                });
                if (!response.ok) {
                    const error = await response.json();
                    const table = document.getElementsByClassName('data-tbody')[0] as HTMLElement;
                    table.innerHTML = `Ошибка: ${error}`;
                    return;
                }
                const result = await response.json() as ResponseDetectType;
                const imageOriginal = document.getElementsByClassName('imageoriginal')[0] as HTMLImageElement;
                const canvasOriginal = document.getElementsByClassName('canvasoriginal')[0] as HTMLCanvasElement;
                for (const [key, rect] of Object.entries(result['fileOriginal'])) {
                    drawRect(rect, imageOriginal, canvasOriginal, "original");
                }
                const imageTest = document.getElementsByClassName('imagetest')[0] as HTMLImageElement;
                const canvasTest = document.getElementsByClassName('canvastest')[0] as HTMLCanvasElement;
                for (const [key, rect] of Object.entries(result['fileTest'])) {
                    drawRect(rect, imageTest, canvasTest, "test");
                }
            } catch (error) {
                console.error('Ошибка при загрузке файлов:', error);
                const table = document.getElementsByClassName('data-tbody')[0] as HTMLElement;
                table.innerHTML = `Проблема загрзки`;
            }
        } else {
            alert("Пожалуйста, выберите оригинальную подпись и проверяемую подпись.");
        }
    };

    const handleClearSignatures = async () => {
        if (selectedSignatures.original && selectedSignatures.test) {
            const fileOriginal = document.getElementsByName('fileOriginal')[0] as HTMLInputElement;
            const fileTest = document.getElementsByName('fileTest')[0] as HTMLInputElement;
            if (!fileOriginal.files?.[0] || !fileTest.files?.[0]) {
                alert('Пожалуйста, выберите оба файла перед загрузкой.');
                return;
            }
            const formData = new FormData();
            formData.append('fileOriginal[file]', fileOriginal.files[0]);
            formData.append('fileTest[file]', fileTest.files[0]);
            formData.append('fileOriginal[y1]', document.getElementById('y1original').value);
            formData.append('fileOriginal[x1]', document.getElementById('x1original').value);
            formData.append('fileOriginal[y2]', document.getElementById('y2original').value);
            formData.append('fileOriginal[x2]', document.getElementById('x2original').value);
            formData.append('fileTest[y1]', document.getElementById('y1test').value);
            formData.append('fileTest[x1]', document.getElementById('x1test').value);
            formData.append('fileTest[y2]', document.getElementById('y2test').value);
            formData.append('fileTest[x2]', document.getElementById('x2test').value);
            try {
                const response = await fetch(`${DETECT_PATH}/clear-signatures`, {
                    method: 'POST',
                    body: formData,
                });
                if (!response.ok) {
                    const error = await response.json();
                    const table = document.getElementsByClassName('data-tbody')[0] as HTMLElement;
                    table.innerHTML = `Ошибка: ${error}`;
                    return;
                }
                const result = await response.json() as ResponseBlobType;

                const imageOriginal = document.getElementsByClassName(`imageChangeoriginal`)[0] as HTMLImageElement;
                const imageTest = document.getElementsByClassName(`imageChangetest`)[0] as HTMLImageElement;
                imageOriginal.src = URL.createObjectURL(base64ToBlob(result['fileOriginal']));
                imageTest.src = URL.createObjectURL(base64ToBlob(result['fileTest']));
            } catch (error) {
                console.error('Ошибка при загрузке файлов:', error);
                const table = document.getElementsByClassName('data-tbody')[0] as HTMLElement;
                table.innerHTML = `Проблема загрзки`;
            }
        } else {
            alert("Пожалуйста, выберите оригинальную подпись и проверяемую подпись.");
        }
    }

    const handleVerifySignatures = async () => {
        if (selectedSignatures.original && selectedSignatures.test) {
            const imageOriginal = document.getElementsByClassName(`imageChangeoriginal`)[0] as HTMLImageElement;
            const imageTest = document.getElementsByClassName(`imageChangetest`)[0] as HTMLImageElement;

            const formData = new FormData();
            const responseOriginal = await fetch(imageOriginal.src);
            const blobOriginal = await responseOriginal.blob();
            formData.append("fileOriginal", blobOriginal, "fileOriginal.jpg");
            const responseTest = await fetch(imageTest.src);
            const blobTest = await responseTest.blob();
            formData.append("fileTest", blobTest, "fileTest.jpg");
            try {
                // Отправляем FormData на сервер
                const uploadResponse = await fetch(`${DETECT_PATH}/verify-signatures`, {
                    method: 'POST',
                    body: formData,
                });

                if (!uploadResponse.ok) {
                    const error = await response.json();
                    const table = document.getElementsByClassName('data-tbody')[0] as HTMLElement;
                    table.innerHTML = `Ошибка: ${error}`;
                    return;
                }
                const result = await uploadResponse.json() as ResponseVerifyType;
                const tableBody = document.getElementsByClassName('data-tbody')[0] as HTMLElement;
                tableBody.innerHTML = "";
                for (const [key, value] of Object.entries(result)) {
                    const row = document.createElement("tr");
                    const cell1 = document.createElement("td");
                    const cell2 = document.createElement("td");
                    cell1.textContent = key;
                    cell2.textContent = value[0] as string;
                    row.appendChild(cell1);
                    row.appendChild(cell2);
                    tableBody.appendChild(row);
                }
            } catch (error) {
                console.error('Ошибка при загрузке файлов:', error);
                const table = document.getElementsByClassName('data-tbody')[0] as HTMLElement;
                table.innerHTML = `Проблема загрзки`;
            }
        } else {
            alert("Пожалуйста, выберите оригинальную подпись и проверяемую подпись.");
        }
    };

    const handlePointsSignatures = async () => {
        if (selectedSignatures.original && selectedSignatures.test) {
            const imageOriginal = document.getElementsByClassName(`imageChangeoriginal`)[0] as HTMLImageElement;
            const imageTest = document.getElementsByClassName(`imageChangetest`)[0] as HTMLImageElement;

            const formData = new FormData();
            const responseOriginal = await fetch(imageOriginal.src);
            const blobOriginal = await responseOriginal.blob();
            formData.append("fileOriginal", blobOriginal, "fileOriginal.jpg");
            const responseTest = await fetch(imageTest.src);
            const blobTest = await responseTest.blob();
            formData.append("fileTest", blobTest, "fileTest.jpg");
            try {
                // Отправляем FormData на сервер
                const uploadResponse = await fetch(`${DETECT_PATH}/points-signatures`, {
                    method: 'POST',
                    body: formData,
                });

                if (!uploadResponse.ok) {
                    const error = await uploadResponse.json();
                    const table = document.getElementsByClassName('data-tbody')[0] as HTMLElement;
                    table.innerHTML = `Ошибка: ${error}`;
                    return;
                }
                const result = await uploadResponse.json() as ResponseBlobType;

                const imageChangeoriginal = document.getElementsByClassName(`imageChangeoriginal`)[0] as HTMLImageElement;
                const imageChangetest = document.getElementsByClassName(`imageChangetest`)[0] as HTMLImageElement;
                imageChangeoriginal.src = URL.createObjectURL(base64ToBlob(result['fileOriginal']));
                imageChangetest.src = URL.createObjectURL(base64ToBlob(result['fileTest']));
            } catch (error) {
                console.error('Ошибка при загрузке файлов:', error);
                const table = document.getElementsByClassName('data-tbody')[0] as HTMLElement;
                table.innerHTML = `Проблема загрзки`;
            }
        } else {
            alert("Пожалуйста, выберите оригинальную подпись и проверяемую подпись.");
        }
    };

    // Функция для загрузки изображения на canvas
    const loadImageOnCanvas = (url: string, type: filesType) => {
        const canvas = document.getElementsByClassName(`canvas${type}`)[0] as HTMLCanvasElement;
        const img = document.getElementsByClassName(`image${type}`)[0] as HTMLImageElement;
        img.src = url;
        img.onload = () => {
            if (canvas && img) {
                const ctx = canvas.getContext("2d");
                if (!ctx) return;

                canvas.width = img.width; // Устанавливаем размеры canvas по изображению
                canvas.height = img.height;
                ctx.clearRect(0, 0, canvas.width, canvas.height); // Очищаем canvas перед рисованием
                ctx.drawImage(img, 0, 0); // Рисуем изображение на canvas
            }
        };
    };

    // Функция для обновления hidden input
    const updateHiddenInputs = (type: filesType, x1: number, y1: number, x2: number, y2: number) => {
        const y1Input = document.getElementById(`y1${type}`) as HTMLInputElement;
        const x1Input = document.getElementById(`x1${type}`) as HTMLInputElement;
        const y2Input = document.getElementById(`y2${type}`) as HTMLInputElement;
        const x2Input = document.getElementById(`x2${type}`) as HTMLInputElement;
        if (y1Input) y1Input.value = y1;
        if (x1Input) x1Input.value = x1;
        if (y2Input) y2Input.value = y2;
        if (x2Input) x2Input.value = x2;
    };

    // Функция для начала выделения
    const startSelection = (e: React.MouseEvent, type: filesType) => {
        if (e.button !== 0) return;

        const canvas = document.getElementsByClassName(`canvas${type}`)[0] as HTMLCanvasElement;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();

        const startX = e.clientX - rect.left;
        const startY = e.clientY - rect.top;

        setStartPos({ x: startX, y: startY });
        setCurrentPos({ x: startX, y: startY });
        setIsSelecting(true);

        // Сразу записываем начальные координаты в hidden input
        updateHiddenInputs(type, startX, startY, startX, startY);

    };

    // Функция для обновления области при движении мыши
    const onMouseMove = (e: React.MouseEvent, type: filesType) => {
        if (e.button !== 0) return;
        if (!isSelecting) return;

        const canvas = document.getElementsByClassName(`canvas${type}`)[0] as HTMLCanvasElement;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();

        const newX = e.clientX - rect.left;
        const newY = e.clientY - rect.top;

        const endPos = { x: newX, y: newY };
        setCurrentPos(endPos);

        drawSelectionRect(startPos, endPos, type);

        updateHiddenInputs(type, startPos.x, startPos.y, newX, newY);

    };

    // Функция для завершения выделения
    const stopSelection = (e: React.MouseEvent, type: filesType) => {
        if (e.button !== 0) return;
        setIsSelecting(false);
    };

    // Функция для рисования прямоугольника выделения
    const drawSelectionRect = (start: { x: number, y: number },
                                endPos: { x: number, y: number },
                                type: filesType) => {

        const canvas = document.getElementsByClassName(`canvas${type}`)[0] as HTMLCanvasElement;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height); // Очистить старый прямоугольник

        // Сначала рисуем изображение
        const img = document.getElementsByClassName(`image${type}`)[0] as HTMLImageElement;
        if (img) {
            ctx.drawImage(img, 0, 0); // Рисуем изображение на canvas
        }

        // Рисуем новый прямоугольник
        const width = endPos.x - start.x;
        const height = endPos.y - start.y;

        ctx.beginPath();
        ctx.rect(start.x, start.y, width, height);
        ctx.strokeStyle = "red";
        ctx.lineWidth = 2;
        ctx.stroke();
    };

    const renderSignatureOptions = (type: fileType) => (
        <select onChange={(e) => handleSelectSignature(type, e.target.value)}>
            <option value="">-- Выберите подпись --</option>
            {signatures[type].map((signature) => (
                <option key={signature.id} value={signature.blobUrl}>
                    {signature.name}
                </option>
            ))}
        </select>
    );

    const renderPreview = (type: fileType) => {
        // if (previews[type]) {
            // Возвращаем JSX для предварительного просмотра
            return (
                <div
                    className="preview-container"
                    style={{display : previews[type] ? "block" : "none"}}
                    >
                    <h4>{type === 'original' ? 'Оригинальная подпись:' : 'Проверяемая подпись:'}</h4>
                    <img
                        ref={imgRef}
                        src={previews[type]!}
                        data-type={type}
                        alt={`${type} Signature`}
                        className={`image${type} image-preview large-preview`}
                        style={{ display: "none" }}
                    />
                    <br/>
                    <canvas
                        className={`canvas${type}`}
                        id={`canvas${type}`}
                        data-type={type}
                        ref={canvasRef}
                        width={500} // Размеры канваса (например)
                        height={500}
                        onMouseDown={(e) => startSelection(e, type)}
                        onMouseMove={(e) => onMouseMove(e, type)}
                        onMouseUp={(e) => stopSelection(e, type)}
                        onMouseLeave={(e) => stopSelection(e, type)}
                        style={{ border: "1px solid black" }}
                    >
                        Ваш браузер не поддерживает canvas.
                    </canvas>
                    <br/>
                    <img
                        data-type={type}
                        alt={`${type} Signature Change`}
                        className={`imageChange${type} image-preview large-preview`}
                    />
                    <input
                        type={"hidden"}
                        id={`x1${type}`}
                        name={`x1${type}`}
                        data-type={type} />
                    <input
                        type={"hidden"}
                        id={`y1${type}`}
                        name={`y1${type}`}
                        data-type={type} />
                    <input
                        type={"hidden"}
                        id={`x2${type}`}
                        name={`x2${type}`}
                        data-type={type} />
                    <input
                        type={"hidden"}
                        id={`y2${type}`}
                        name={`y2${type}`}
                        data-type={type} />
                </div>
            );
        // }
        return null; // Если `previews[type]` отсутствует, ничего не рендерим
    }

    return (
        <div className="signature-comparison-container">
            <div className="signature-container">
                <h3>Загрузите оригинальные подписи</h3>
                {loading && <p className="loading-message">Загрузка подписей...</p>}
                {error && <p className="error-message">{error}</p>}

                <input
                    type="file"
                    accept="image/*"
                    name="fileOriginal"
                    multiple
                    onChange={(e) => handleFileChange(e, "original")}
                    ref={originalInputRef}
                    style={{ display: "none" }}
                />
                <button
                    className="file-upload-button"
                    onClick={() => originalInputRef.current?.click()}
                >
                    Загрузить оригинальные подписи
                </button>

                {signatures.original.length > 0 && (
                    <>
                        <h4>Оригинальные подписи:</h4>
                        <ul>
                            {signatures.original.map((signature) => (
                                <li key={signature.id}>
                                    {signature.name}
                                    <button
                                        className="delete-button"
                                        onClick={() => handleDeleteSignature(signature.id)}
                                    >
                                        Удалить
                                    </button>
                                </li>
                            ))}
                        </ul>
                        {renderSignatureOptions("original")}
                        {renderPreview("original")}
                    </>
                )}
            </div>

            <div className="signature-container">
                <h3>Загрузите проверяемые подписи</h3>
                <input
                    type="file"
                    accept="image/*"
                    name="fileTest"
                    multiple
                    onChange={(e) => handleFileChange(e, "test")}
                    ref={testInputRef}
                    style={{ display: "none" }}
                />
                <button
                    className="file-upload-button"
                    onClick={() => testInputRef.current?.click()}
                >
                    Загрузить проверяемые подписи
                </button>

                {signatures.test.length > 0 && (
                    <>
                        <h4>Проверяемые подписи:</h4>
                        {renderSignatureOptions("test")}
                        {renderPreview("test")}
                    </>
                )}
            </div>

            <div className="verify-button-container">
                <button
                    className="action-button transform-button"
                    onClick={handleTransformSignatures}
                    disabled={!selectedSignatures.original || !selectedSignatures.test}
                >
                    Выровнять изображение
                </button>
                <button
                    className="action-button detect-button"
                    onClick={handleDetectSignatures}
                    disabled={!selectedSignatures.original || !selectedSignatures.test}
                >
                    Найти подписи
                </button>
                <button
                    className="action-button clear-button"
                    onClick={handleClearSignatures}
                    disabled={!selectedSignatures.original || !selectedSignatures.test}
                >
                    Очистить подпись
                </button>
                <button
                    className="action-button verify-button"
                    onClick={handleVerifySignatures}
                    disabled={!selectedSignatures.original || !selectedSignatures.test}
                >
                    Проверить подлинность
                </button>
                <button
                    className="action-button points-button"
                    onClick={handlePointsSignatures}
                    disabled={!selectedSignatures.original || !selectedSignatures.test}
                >
                    Получить точки
                </button>
                <div className="response">
                    <table className="data-table">
                        <tbody className="data-tbody">
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default SignatureUploader;
