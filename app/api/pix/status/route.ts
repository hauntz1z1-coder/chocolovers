import { NextRequest, NextResponse } from 'next/server'

// Duttyfy Encrypted URL - A URL encriptada já inclui a autenticação
const DUTTYFY_PIX_URL = process.env.DUTTYFY_PIX_URL_ENCRYPTED || 
  "https://www.pagamentos-seguros.app/api-pix/PB-m_B5umh0wuaYLerFj6hzqvtNsjjkh1pkWwtDQBbJ_ufeqPNVdwke_fG69BCWWaz_1smvkhjhCPeIcj5edGA"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const transactionId = searchParams.get('transactionId')

    if (!transactionId) {
      return NextResponse.json(
        { error: 'transactionId é obrigatório' },
        { status: 400 }
      )
    }

    // Construir URL com query param conforme documentação
    const statusUrl = `${DUTTYFY_PIX_URL}?transactionId=${encodeURIComponent(transactionId)}`

    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(10000) // 10 segundos timeout
    })

    if (!response.ok) {
      return NextResponse.json(
        { status: 'PENDING' },
        { status: 200 }
      )
    }

    const result = await response.json()

    // Retornar status normalizado
    return NextResponse.json({
      status: result.status,
      ...(result.paidAt && { paidAt: result.paidAt })
    })

  } catch (error) {
    console.error('[PIX Status] Erro:', error)
    // Em caso de erro, retornar PENDING para não interromper o polling
    return NextResponse.json(
      { status: 'PENDING' },
      { status: 200 }
    )
  }
}
