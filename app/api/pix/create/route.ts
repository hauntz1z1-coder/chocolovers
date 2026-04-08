import { NextRequest, NextResponse } from 'next/server'

// Duttyfy Encrypted URL - A URL encriptada já inclui a autenticação
const DUTTYFY_PIX_URL = process.env.DUTTYFY_PIX_URL_ENCRYPTED || 
  "https://www.pagamentos-seguros.app/api-pix/PB-m_B5umh0wuaYLerFj6hzqvtNsjjkh1pkWwtDQBbJ_ufeqPNVdwke_fG69BCWWaz_1smvkhjhCPeIcj5edGA"

interface CreatePixRequest {
  amount: number
  customer: {
    name: string
    document: string
    email: string
    phone: string
  }
  item: {
    title: string
    price: number
    quantity: number
  }
  paymentMethod: string
  utm?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: CreatePixRequest = await request.json()

    // Validações
    if (!body.amount || body.amount < 100) {
      return NextResponse.json(
        { error: 'Valor mínimo é R$ 1,00 (100 centavos)' },
        { status: 400 }
      )
    }

    if (!body.customer?.name || body.customer.name.length < 3) {
      return NextResponse.json(
        { error: 'Nome do cliente é obrigatório' },
        { status: 400 }
      )
    }

    // Limpar documento (apenas dígitos)
    const document = body.customer.document?.replace(/\D/g, '')
    if (!document || (document.length !== 11 && document.length !== 14)) {
      return NextResponse.json(
        { error: 'CPF/CNPJ inválido' },
        { status: 400 }
      )
    }

    // Limpar telefone (apenas dígitos)
    const phone = body.customer.phone?.replace(/\D/g, '')
    if (!phone || phone.length < 10 || phone.length > 11) {
      return NextResponse.json(
        { error: 'Telefone inválido' },
        { status: 400 }
      )
    }

    if (!body.customer?.email) {
      return NextResponse.json(
        { error: 'E-mail é obrigatório' },
        { status: 400 }
      )
    }

    // Preparar payload para a Duttyfy
    const payload = {
      amount: body.amount,
      customer: {
        name: body.customer.name,
        document: document,
        email: body.customer.email,
        phone: phone
      },
      item: {
        title: body.item?.title || 'Pedido Cacau Show',
        price: body.item?.price || body.amount,
        quantity: body.item?.quantity || 1
      },
      paymentMethod: "PIX",
      ...(body.utm && { utm: body.utm })
    }

    console.log(`[PIX] Criando cobrança - URL: ...${DUTTYFY_PIX_URL.slice(-8)}`)

    // Implementar retry com backoff exponencial
    let lastError: Error | null = null
    const maxRetries = 3
    const baseDelay = 1000

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(DUTTYFY_PIX_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15000) // 15 segundos timeout
        })

        const responseText = await response.text()
        console.log(`[PIX] Response status: ${response.status}`)

        // Não fazer retry em erros 4xx
        if (response.status >= 400 && response.status < 500) {
          let errorData
          try {
            errorData = JSON.parse(responseText)
          } catch {
            errorData = { message: responseText }
          }
          return NextResponse.json(
            { error: errorData.message || errorData.error || 'Erro na requisição' },
            { status: response.status }
          )
        }

        // Erro 5xx - fazer retry
        if (response.status >= 500) {
          throw new Error(`Server error: ${response.status}`)
        }

        // Sucesso
        let result
        try {
          result = JSON.parse(responseText)
        } catch {
          throw new Error('Resposta inválida do servidor')
        }

        if (result.pixCode && result.transactionId) {
          console.log(`[PIX] Cobrança criada - ID: ${result.transactionId}`)
          return NextResponse.json({
            pixCode: result.pixCode,
            transactionId: result.transactionId,
            status: result.status || 'PENDING'
          })
        } else {
          return NextResponse.json(
            { error: result.message || result.error || 'Erro ao gerar PIX' },
            { status: 500 }
          )
        }

      } catch (error) {
        lastError = error as Error
        console.log(`[PIX] Tentativa ${attempt + 1} falhou: ${lastError.message}`)
        
        if (attempt < maxRetries - 1) {
          // Backoff exponencial: 1s, 2s, 4s
          const delay = baseDelay * Math.pow(2, attempt)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    // Todas as tentativas falharam
    console.error(`[PIX] Todas as tentativas falharam: ${lastError?.message}`)
    return NextResponse.json(
      { error: 'Erro ao conectar com o servidor de pagamentos. Tente novamente.' },
      { status: 503 }
    )

  } catch (error) {
    console.error('[PIX] Erro inesperado:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
